const http = require('http');
const jwt = require('jsonwebtoken');
const { io: connecter } = require('socket.io-client');
const realtime = require('./realtime');
const { jwtSecret } = require('./config/env');

let serveur;
let ioServeur;
let url;
const clients = [];
// Remplace la vraie vérification (server.js l'injecte avec evenementsService.getOrganisateurId, qui a
// besoin de Prisma) : realtime.js n'a ainsi jamais besoin du client Prisma généré pour être testé.
const verifierProprietaireEvenement = jest.fn();

beforeAll((done) => {
  serveur = http.createServer();
  ioServeur = realtime.init(serveur, { verifierProprietaireEvenement });
  serveur.listen(0, () => {
    url = `http://localhost:${serveur.address().port}`;
    done();
  });
});

afterEach(() => clients.splice(0).forEach((c) => c.close()));
afterAll(() => ioServeur.close());

function client(userId, role = 'spectateur') {
  const c = connecter(url, { auth: { token: jwt.sign({ userId, role }, jwtSecret) } });
  clients.push(c);
  return c;
}
const attendre = (c, evt) => new Promise((resolve) => c.once(evt, resolve));
const emettre = (c, evt, data) => new Promise((resolve) => c.emit(evt, data, resolve));

describe('sélection de sièges en temps réel (#8, #31, #32)', () => {
  it('diffuse la sélection, bloque les autres, puis libère à la déconnexion', async () => {
    const a = client(1);
    const b = client(2);
    a.emit('plan:rejoindre', 7);
    b.emit('plan:rejoindre', 7);
    await Promise.all([attendre(a, 'plan:selections'), attendre(b, 'plan:selections')]);

    const vuParB = attendre(b, 'siege:selectionne');
    await expect(emettre(a, 'siege:selectionner', { evenementId: 7, siegeId: 101 })).resolves.toEqual({ ok: true, delaiMs: realtime.DELAI_SELECTION_MS });
    await expect(vuParB).resolves.toEqual({ siegeId: 101 });

    expect((await emettre(b, 'siege:selectionner', { evenementId: 7, siegeId: 101 })).ok).toBe(false);
    expect(realtime.estSelectionneParAutre(7, [101], 2)).toBe(true);
    expect(realtime.estSelectionneParAutre(7, [101], 1)).toBe(false);

    // Un nouvel arrivant voit le siège déjà en sélection.
    const c = client(3);
    c.emit('plan:rejoindre', 7);
    await expect(attendre(c, 'plan:selections')).resolves.toEqual({ siegeIds: [101] });

    const libere = attendre(b, 'siege:libere');
    a.close();
    await expect(libere).resolves.toEqual({ siegeId: 101 });
    expect(realtime.estSelectionneParAutre(7, [101], 2)).toBe(false);
  });

  it('refuse la sélection à un visiteur non connecté', async () => {
    const anonyme = connecter(url);
    clients.push(anonyme);
    expect((await emettre(anonyme, 'siege:selectionner', { evenementId: 7, siegeId: 102 })).ok).toBe(false);
  });

  it('libère automatiquement après le délai de sélection', async () => {
    const a = client(1);
    await attendre(a, 'connect');
    jest.useFakeTimers({ advanceTimers: true });
    await emettre(a, 'siege:selectionner', { evenementId: 8, siegeId: 201 });
    expect(realtime.estSelectionneParAutre(8, [201], 2)).toBe(true);
    jest.advanceTimersByTime(realtime.DELAI_SELECTION_MS);
    jest.useRealTimers();
    expect(realtime.estSelectionneParAutre(8, [201], 2)).toBe(false);
  });

  it("un nouveau siège repousse l'échéance de toute la sélection, qui expire ensuite d'un coup (#37)", async () => {
    const a = client(1);
    await attendre(a, 'connect');
    a.emit('plan:rejoindre', 9);
    await attendre(a, 'plan:selections');
    jest.useFakeTimers({ advanceTimers: true });

    await emettre(a, 'siege:selectionner', { evenementId: 9, siegeId: 301 });
    jest.advanceTimersByTime(30_000);
    // 301 est tenu depuis 30 s quand 302 est sélectionné : son échéance doit être repoussée avec celle de 302.
    await emettre(a, 'siege:selectionner', { evenementId: 9, siegeId: 302 });

    jest.advanceTimersByTime(40_000); // 70 s depuis 301, mais seulement 40 s depuis le reset : pas encore expiré
    expect(realtime.estSelectionneParAutre(9, [301, 302], 2)).toBe(true);

    const libere = attendre(a, 'sieges:liberes');
    jest.advanceTimersByTime(20_000); // 60 s depuis le reset commun : les deux expirent ensemble
    jest.useRealTimers();
    await expect(libere).resolves.toEqual({ siegeIds: [301, 302] });
    expect(realtime.estSelectionneParAutre(9, [301, 302], 2)).toBe(false);
  });

  it("désélectionner un siège manuellement ne coupe pas l'échéance des autres sièges tenus (#37)", async () => {
    const a = client(1);
    await attendre(a, 'connect');
    a.emit('plan:rejoindre', 11);
    await attendre(a, 'plan:selections');
    jest.useFakeTimers({ advanceTimers: true });

    await emettre(a, 'siege:selectionner', { evenementId: 11, siegeId: 501 });
    await emettre(a, 'siege:selectionner', { evenementId: 11, siegeId: 502 });

    const confirmeLibere = attendre(a, 'siege:libere');
    a.emit('siege:deselectionner', { evenementId: 11, siegeId: 501 });
    await expect(confirmeLibere).resolves.toEqual({ siegeId: 501 });
    expect(realtime.estSelectionneParAutre(11, [502], 2)).toBe(true);

    jest.advanceTimersByTime(realtime.DELAI_SELECTION_MS);
    jest.useRealTimers();
    expect(realtime.estSelectionneParAutre(11, [502], 2)).toBe(false);
  });

  it("un minuteur orphelin (sélection vidée) ne libère pas une nouvelle sélection faite entretemps (#162)", async () => {
    const a = client(1);
    await attendre(a, 'connect');
    a.emit('plan:rejoindre', 12);
    await attendre(a, 'plan:selections');
    jest.useFakeTimers({ advanceTimers: true });

    await emettre(a, 'siege:selectionner', { evenementId: 12, siegeId: 601 });
    await emettre(a, 'siege:selectionner', { evenementId: 12, siegeId: 602 });
    // Toute la sélection est désélectionnée : plus rien dans `selections`, mais le minuteur partagé,
    // jamais annulé (voir `liberer`), reste programmé pour la même échéance.
    const libere601 = attendre(a, 'siege:libere');
    a.emit('siege:deselectionner', { evenementId: 12, siegeId: 601 });
    await expect(libere601).resolves.toEqual({ siegeId: 601 });
    const libere602 = attendre(a, 'siege:libere');
    a.emit('siege:deselectionner', { evenementId: 12, siegeId: 602 });
    await expect(libere602).resolves.toEqual({ siegeId: 602 });

    jest.advanceTimersByTime(40_000);
    // Nouvelle sélection avant l'échéance orpheline : son propre minuteur (à +60 s d'ici) ne doit pas
    // être court-circuité par l'ancien, qui arrive dans 20 s.
    await emettre(a, 'siege:selectionner', { evenementId: 12, siegeId: 603 });

    jest.advanceTimersByTime(20_000); // 60 s depuis 601/602 : l'ancien minuteur orphelin se déclenche
    expect(realtime.estSelectionneParAutre(12, [603], 2)).toBe(true);

    jest.advanceTimersByTime(40_000); // 60 s depuis 603 : son propre minuteur se déclenche
    jest.useRealTimers();
    expect(realtime.estSelectionneParAutre(12, [603], 2)).toBe(false);
  });

  it("une reconnexion laisse aussi un minuteur orphelin, qui ne doit pas libérer la sélection faite depuis la nouvelle connexion (#162)", async () => {
    const a = client(1);
    await attendre(a, 'connect');
    a.emit('plan:rejoindre', 13);
    await attendre(a, 'plan:selections');
    jest.useFakeTimers({ advanceTimers: true });

    await emettre(a, 'siege:selectionner', { evenementId: 13, siegeId: 701 });

    const b = client(1);
    await attendre(b, 'connect');
    b.emit('plan:rejoindre', 13);
    await attendre(b, 'plan:selections');

    // La déconnexion libère aussi via `liberer` (sans clearTimeout) : même minuteur orphelin que la
    // désélection manuelle. `b` voit la diffusion, ce qui confirme que le serveur l'a bien traitée.
    const vuParB = attendre(b, 'siege:libere');
    a.close();
    await expect(vuParB).resolves.toEqual({ siegeId: 701 });

    jest.advanceTimersByTime(40_000);
    await emettre(b, 'siege:selectionner', { evenementId: 13, siegeId: 702 });

    jest.advanceTimersByTime(20_000); // 60 s depuis 701 : l'ancien minuteur orphelin se déclenche
    expect(realtime.estSelectionneParAutre(13, [702], 2)).toBe(true);

    jest.advanceTimersByTime(40_000); // 60 s depuis 702 : son propre minuteur se déclenche
    jest.useRealTimers();
    expect(realtime.estSelectionneParAutre(13, [702], 2)).toBe(false);
  });

  it("réserver un siège ne coupe plus le minuteur partagé des autres sièges du même spectateur (#162)", async () => {
    // Même spectateur, deux onglets : deux sockets, un seul userId.
    const a = client(1);
    const b = client(1);
    await Promise.all([attendre(a, 'connect'), attendre(b, 'connect')]);
    a.emit('plan:rejoindre', 14);
    b.emit('plan:rejoindre', 14);
    await Promise.all([attendre(a, 'plan:selections'), attendre(b, 'plan:selections')]);
    jest.useFakeTimers({ advanceTimers: true });

    await emettre(a, 'siege:selectionner', { evenementId: 14, siegeId: 601 });
    jest.advanceTimersByTime(20_000);
    await emettre(b, 'siege:selectionner', { evenementId: 14, siegeId: 602 }); // repousse le minuteur partagé

    // Le 601 est réservé (confirmation REST, hors socket) : son entrée disparaît de `selections`, mais
    // le minuteur partagé du spectateur ne doit pas être coupé pour autant (#162, suite du minuteur orphelin).
    realtime.diffuserReserves(14, [601]);
    expect(realtime.estSelectionneParAutre(14, [602], 2)).toBe(true);

    jest.advanceTimersByTime(60_000); // 60 s depuis la sélection de 602 : son échéance (repoussée) arrive
    jest.useRealTimers();
    expect(realtime.estSelectionneParAutre(14, [602], 2)).toBe(false);
  });
});

describe('plafond global de la sélection (#163)', () => {
  // Serveur à part, avec un plafond de 1,2 s et de vrais minuteurs : de faux minuteurs qui sautent
  // 3 minutes déclencheraient aussi le battement de cœur de Socket.IO et couperaient les clients.
  const PLAFOND_MS = 1200;
  let rt;
  let serveurPlafond;
  let ioPlafond;
  let urlPlafond;
  const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll((done) => {
    jest.isolateModules(() => {
      rt = require('./realtime');
    });
    serveurPlafond = http.createServer();
    ioPlafond = rt.init(serveurPlafond, { plafondMs: PLAFOND_MS });
    serveurPlafond.listen(0, () => {
      urlPlafond = `http://localhost:${serveurPlafond.address().port}`;
      done();
    });
  });
  afterAll(() => ioPlafond.close());

  async function spectateurSurPlan(userId, evenementId) {
    const c = connecter(urlPlafond, { auth: { token: jwt.sign({ userId, role: 'spectateur' }, jwtSecret) } });
    clients.push(c);
    c.emit('plan:rejoindre', evenementId);
    await attendre(c, 'plan:selections');
    return c;
  }
  const selectionner = (c, evenementId, siegeId) => emettre(c, 'siege:selectionner', { evenementId, siegeId });

  it('la valeur réelle du plafond est de 3 minutes', () => {
    expect(realtime.PLAFOND_SELECTION_MS).toBe(3 * 60_000);
  });

  it('libère toute la sélection une fois le plafond atteint, même un siège ajouté juste avant, et prévient le spectateur', async () => {
    const a = await spectateurSurPlan(1, 30);
    const b = await spectateurSurPlan(2, 30);
    const plafond = attendre(a, 'selection:plafond');
    const liberesVusParB = [];
    b.on('siege:libere', ({ siegeId }) => liberesVusParB.push(siegeId));

    await selectionner(a, 30, 301);
    await dormir(400);
    await selectionner(a, 30, 302);
    await dormir(600); // ~1 s : le dernier siège est ajouté juste avant le plafond
    await selectionner(a, 30, 303);
    expect(rt.estSelectionneParAutre(30, [301, 302, 303], 2)).toBe(true);

    await expect(plafond).resolves.toEqual({ evenementId: 30, siegeIds: [301, 302, 303] });
    expect(rt.estSelectionneParAutre(30, [301], 2)).toBe(false);
    expect(rt.estSelectionneParAutre(30, [302], 2)).toBe(false);
    expect(rt.estSelectionneParAutre(30, [303], 2)).toBe(false);
    await dormir(100);
    expect(liberesVusParB).toEqual(expect.arrayContaining([301, 302, 303]));
  });

  it("n'envoie le message du plafond qu'au spectateur concerné", async () => {
    const a = await spectateurSurPlan(1, 31);
    const b = await spectateurSurPlan(2, 31);
    let recuParB = false;
    b.on('selection:plafond', () => {
      recuParB = true;
    });

    await selectionner(a, 31, 311);
    await attendre(a, 'selection:plafond');
    await dormir(100);
    expect(recuParB).toBe(false);
  });

  it('repart de zéro quand le spectateur ne tient plus aucun siège', async () => {
    const a = await spectateurSurPlan(1, 32);
    let plafondRecu = false;
    a.on('selection:plafond', () => {
      plafondRecu = true;
    });

    await selectionner(a, 32, 321);
    const libere = attendre(a, 'siege:libere');
    a.emit('siege:deselectionner', { evenementId: 32, siegeId: 321 });
    await libere;

    await dormir(900);
    await selectionner(a, 32, 322); // nouveau plafond, qui part d'ici
    await dormir(600); // ~1,5 s depuis le premier siège : l'ancien plafond aurait déjà tout libéré

    expect(plafondRecu).toBe(false);
    expect(rt.estSelectionneParAutre(32, [322], 2)).toBe(true);
  });

  it('repart de zéro après une réservation confirmée', async () => {
    const a = await spectateurSurPlan(1, 33);
    let plafondRecu = false;
    a.on('selection:plafond', () => {
      plafondRecu = true;
    });

    await selectionner(a, 33, 331);
    rt.diffuserReserves(33, [331]);
    await dormir(900);
    await selectionner(a, 33, 332);
    await dormir(600);

    expect(plafondRecu).toBe(false);
    expect(rt.estSelectionneParAutre(33, [332], 2)).toBe(true);
  });
});

describe('plafond (#163) et échéance commune des 60 s (#37) ensemble', () => {
  // Plafond de 90 s, plus long que le délai de 60 s, avec de faux minuteurs (comme les tests #37 plus haut).
  const PLAFOND_MS = 90_000;
  let rt;
  let serveurMixte;
  let ioMixte;
  let urlMixte;

  beforeAll((done) => {
    jest.isolateModules(() => {
      rt = require('./realtime');
    });
    serveurMixte = http.createServer();
    ioMixte = rt.init(serveurMixte, { plafondMs: PLAFOND_MS });
    // Battement de cœur repoussé à 10 min sur ce serveur de test : en avançant les faux minuteurs de plus
    // de 60 s, le ping de Socket.IO et son délai de réponse tomberaient d'un coup et couperaient le client.
    ioMixte.engine.opts.pingInterval = 10 * 60_000;
    ioMixte.engine.opts.pingTimeout = 10 * 60_000;
    serveurMixte.listen(0, () => {
      urlMixte = `http://localhost:${serveurMixte.address().port}`;
      done();
    });
  });
  afterAll(() => ioMixte.close());

  async function spectateurSurPlan(userId, evenementId) {
    const c = connecter(urlMixte, { auth: { token: jwt.sign({ userId, role: 'spectateur' }, jwtSecret) } });
    clients.push(c);
    c.emit('plan:rejoindre', evenementId);
    await attendre(c, 'plan:selections');
    return c;
  }
  const selectionner = (c, evenementId, siegeId) => emettre(c, 'siege:selectionner', { evenementId, siegeId });

  it("après le plafond, l'ancienne échéance des 60 s ne libère pas un siège repris entre-temps", async () => {
    const a = await spectateurSurPlan(1, 40);
    jest.useFakeTimers({ advanceTimers: true });

    await selectionner(a, 40, 401);
    jest.advanceTimersByTime(50_000);
    await selectionner(a, 40, 402); // échéance commune repoussée à 110 s
    const plafond = attendre(a, 'selection:plafond');
    jest.advanceTimersByTime(40_000); // 90 s : plafond atteint
    await plafond;

    jest.advanceTimersByTime(5_000);
    await selectionner(a, 40, 401); // 95 s : nouvelle sélection, échéance à 155 s
    jest.advanceTimersByTime(20_000); // 115 s : l'ancienne échéance (110 s) est passée
    jest.useRealTimers();
    expect(rt.estSelectionneParAutre(40, [401], 2)).toBe(true);
  });

  it('le plafond repart de zéro quand toute la sélection expire après 60 s', async () => {
    const a = await spectateurSurPlan(1, 41);
    let plafondRecu = false;
    a.on('selection:plafond', () => {
      plafondRecu = true;
    });
    jest.useFakeTimers({ advanceTimers: true });

    await selectionner(a, 41, 411);
    const expire = attendre(a, 'sieges:liberes');
    jest.advanceTimersByTime(realtime.DELAI_SELECTION_MS);
    await expire;

    jest.advanceTimersByTime(10_000);
    await selectionner(a, 41, 412); // 70 s : nouveau plafond, qui part d'ici
    jest.advanceTimersByTime(25_000); // 95 s : l'ancien plafond (90 s) aurait déjà tout libéré
    jest.useRealTimers();
    expect(plafondRecu).toBe(false);
    expect(rt.estSelectionneParAutre(41, [412], 2)).toBe(true);
  });
});

describe('diffusion des ventes en direct (#35)', () => {
  it("l'organisateur propriétaire rejoint et reçoit les ventes poussées", async () => {
    verifierProprietaireEvenement.mockResolvedValue(7);
    const organisateur = client(7, 'organisateur');
    await expect(emettre(organisateur, 'ventes:rejoindre', 50)).resolves.toEqual({ ok: true });

    const ventes = { totaux: { total: 10, vendus: 1, enSelection: 0, libres: 9 } };
    const recu = attendre(organisateur, 'ventes:maj');
    realtime.diffuserVentes(50, ventes);

    await expect(recu).resolves.toEqual(ventes);
  });

  it("refuse un organisateur qui n'est pas propriétaire de l'événement", async () => {
    verifierProprietaireEvenement.mockResolvedValue(7);
    const autreOrganisateur = client(8, 'organisateur');

    await expect(emettre(autreOrganisateur, 'ventes:rejoindre', 50)).resolves.toEqual({
      ok: false,
      error: "Cet événement ne vous appartient pas.",
    });
  });

  it('refuse un spectateur', async () => {
    const spectateur = client(1, 'spectateur');
    await expect(emettre(spectateur, 'ventes:rejoindre', 50)).resolves.toEqual({
      ok: false,
      error: 'Réservé aux organisateurs connectés.',
    });
    expect(verifierProprietaireEvenement).not.toHaveBeenCalled();
  });

  it("ne diffuse pas à un simple visiteur du plan de salle (room publique distincte)", async () => {
    const visiteurPlan = client(2, 'spectateur');
    visiteurPlan.emit('plan:rejoindre', 50);
    await attendre(visiteurPlan, 'plan:selections');

    let recu = false;
    visiteurPlan.on('ventes:maj', () => {
      recu = true;
    });
    realtime.diffuserVentes(50, { totaux: {} });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(recu).toBe(false);
  });

  it("ne diffuse pas aux organisateurs d'un autre événement", async () => {
    verifierProprietaireEvenement.mockResolvedValue(7);
    const organisateur = client(7, 'organisateur');
    await emettre(organisateur, 'ventes:rejoindre', 51);

    let recu = false;
    organisateur.on('ventes:maj', () => {
      recu = true;
    });
    realtime.diffuserVentes(50, { totaux: {} });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(recu).toBe(false);
  });
});

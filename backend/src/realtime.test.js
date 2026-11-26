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
    await expect(emettre(a, 'siege:selectionner', { evenementId: 7, siegeId: 101 })).resolves.toEqual({ ok: true, delaiMs: realtime.PLAFOND_SELECTION_MS });
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
});

describe('plafond global de la sélection (#163, #169)', () => {
  // Serveur à part, avec un plafond de 1,2 s et de vrais minuteurs : de faux minuteurs qui sautent
  // 2 minutes déclencheraient aussi le battement de cœur de Socket.IO et couperaient les clients.
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

  it('la valeur réelle du plafond est de 2 minutes (#169)', () => {
    expect(realtime.PLAFOND_SELECTION_MS).toBe(2 * 60_000);
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

describe('plafond de 2 minutes, seule limite de temps de la sélection (#169)', () => {
  // Vrai plafond de 2 minutes, avec de faux minuteurs : le battement de cœur de Socket.IO est repoussé à
  // 10 min sur ce serveur, sinon sauter 2 minutes ferait tomber le ping et couperait le client.
  let rt;
  let serveurFaux;
  let ioFaux;
  let urlFaux;
  const PLAFOND = 2 * 60_000;

  beforeAll((done) => {
    jest.isolateModules(() => {
      rt = require('./realtime');
    });
    serveurFaux = http.createServer();
    ioFaux = rt.init(serveurFaux);
    ioFaux.engine.opts.pingInterval = 10 * 60_000;
    ioFaux.engine.opts.pingTimeout = 10 * 60_000;
    serveurFaux.listen(0, () => {
      urlFaux = `http://localhost:${serveurFaux.address().port}`;
      done();
    });
  });
  afterEach(() => jest.useRealTimers());
  afterAll(() => ioFaux.close());

  async function spectateurSurPlan(userId, evenementId) {
    const c = connecter(urlFaux, { auth: { token: jwt.sign({ userId, role: 'spectateur' }, jwtSecret) } });
    clients.push(c);
    c.emit('plan:rejoindre', evenementId);
    await attendre(c, 'plan:selections');
    return c;
  }
  const selectionner = (c, evenementId, siegeId) => emettre(c, 'siege:selectionner', { evenementId, siegeId });

  it('renvoie au client le temps restant avant le plafond, sans le relancer pour un nouveau siège', async () => {
    const a = await spectateurSurPlan(1, 60);
    jest.useFakeTimers({ advanceTimers: true });

    expect(await selectionner(a, 60, 601)).toEqual({ ok: true, delaiMs: PLAFOND });
    jest.advanceTimersByTime(30_000);
    // Ajouté 30 s plus tard : il reste ~90 s pour toute la sélection, pas 2 minutes de nouveau. L'horloge
    // avance aussi en vrai temps (advanceTimers: true) : on tolère quelques centaines de millisecondes.
    const { delaiMs } = await selectionner(a, 60, 602);
    expect(delaiMs).toBeLessThanOrEqual(PLAFOND - 30_000);
    expect(delaiMs).toBeGreaterThan(PLAFOND - 30_000 - 1000);
  });

  it("n'a plus de délai de 60 s : la sélection tient jusqu'au plafond, puis tout est libéré avec un seul message", async () => {
    const a = await spectateurSurPlan(1, 61);
    const b = await spectateurSurPlan(2, 61);
    let liberesGroupes = 0;
    a.on('sieges:liberes', () => {
      liberesGroupes += 1;
    });
    const liberesVusParB = [];
    b.on('siege:libere', ({ siegeId }) => liberesVusParB.push(siegeId));
    jest.useFakeTimers({ advanceTimers: true });

    await selectionner(a, 61, 611);
    jest.advanceTimersByTime(50_000);
    await selectionner(a, 61, 612);
    jest.advanceTimersByTime(60_000); // 110 s : l'ancien délai de 60 s aurait déjà libéré 611
    expect(rt.estSelectionneParAutre(61, [611], 2)).toBe(true);
    expect(rt.estSelectionneParAutre(61, [612], 2)).toBe(true);

    const plafond = attendre(a, 'selection:plafond');
    jest.advanceTimersByTime(10_000); // 2 minutes depuis le premier siège
    await expect(plafond).resolves.toEqual({ evenementId: 61, siegeIds: [611, 612] });
    expect(rt.estSelectionneParAutre(61, [611, 612], 2)).toBe(false);

    jest.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(liberesVusParB).toEqual(expect.arrayContaining([611, 612]));
    expect(liberesGroupes).toBe(0); // plus d'expiration séparée : seul `selection:plafond` prévient
  });

  it('réserver un siège ne relance pas le plafond tant que le spectateur en tient un autre (#162)', async () => {
    // Même spectateur, deux onglets : deux sockets, un seul userId.
    const a = await spectateurSurPlan(1, 62);
    const b = await spectateurSurPlan(1, 62);
    jest.useFakeTimers({ advanceTimers: true });

    await selectionner(a, 62, 621);
    jest.advanceTimersByTime(20_000);
    await selectionner(b, 62, 622);
    rt.diffuserReserves(62, [621]); // confirmation REST de 621, 622 reste tenu depuis l'autre onglet

    const plafond = attendre(b, 'selection:plafond');
    jest.advanceTimersByTime(PLAFOND - 20_000); // 2 minutes depuis 621, pas depuis 622
    await expect(plafond).resolves.toEqual({ evenementId: 62, siegeIds: [622] });
    expect(rt.estSelectionneParAutre(62, [622], 2)).toBe(false);
  });

  it('une reconnexion qui a tout libéré fait repartir le plafond de zéro', async () => {
    const a = await spectateurSurPlan(1, 63);
    const b = await spectateurSurPlan(1, 63);
    jest.useFakeTimers({ advanceTimers: true });

    await selectionner(a, 63, 631);
    const vuParB = attendre(b, 'siege:libere');
    a.close(); // la déconnexion libère 631 : plus aucun siège tenu
    await expect(vuParB).resolves.toEqual({ siegeId: 631 });

    jest.advanceTimersByTime(40_000);
    expect(await selectionner(b, 63, 632)).toEqual({ ok: true, delaiMs: PLAFOND });
    jest.advanceTimersByTime(PLAFOND - 40_000); // 2 minutes depuis 631 : l'ancien plafond ne joue plus
    expect(rt.estSelectionneParAutre(63, [632], 2)).toBe(true);

    const plafond = attendre(b, 'selection:plafond');
    jest.advanceTimersByTime(40_000); // 2 minutes depuis 632
    await expect(plafond).resolves.toEqual({ evenementId: 63, siegeIds: [632] });
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

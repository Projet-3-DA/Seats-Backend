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
    await expect(emettre(a, 'siege:selectionner', { evenementId: 7, siegeId: 101 })).resolves.toEqual({ ok: true });
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

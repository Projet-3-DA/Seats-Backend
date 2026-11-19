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

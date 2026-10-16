const http = require('http');
const jwt = require('jsonwebtoken');
const { io: connecter } = require('socket.io-client');
const realtime = require('./realtime');
const { jwtSecret } = require('./config/env');

let serveur;
let ioServeur;
let url;
const clients = [];

beforeAll((done) => {
  serveur = http.createServer();
  ioServeur = realtime.init(serveur);
  serveur.listen(0, () => {
    url = `http://localhost:${serveur.address().port}`;
    done();
  });
});

afterEach(() => clients.splice(0).forEach((c) => c.close()));
afterAll(() => ioServeur.close());

function client(userId) {
  const c = connecter(url, { auth: { token: jwt.sign({ userId, role: 'spectateur' }, jwtSecret) } });
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

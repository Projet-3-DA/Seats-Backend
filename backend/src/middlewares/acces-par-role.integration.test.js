// Test d'intégration contre un VRAI Postgres (pas de mock) : on attaque l'API comme le ferait un client
// malveillant, sans passer par l'interface, avec de vrais comptes créés par /register et de vrais tokens
// obtenus par /login (#33). Chaque refus est aussi vérifié dans la base : la requête ne doit rien y avoir
// écrit. Les refus par route et par rôle, sans base, sont dans acces-par-role.test.js (#9).
//
// Exclu de `npm test` : lancé avec `npm run test:integration` (voir reservations.integration.test.js).

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const prisma = require('../lib/prisma');

const SUFFIXE = Date.now(); // évite les collisions d'email/nom si la base n'est pas parfaitement vide
const MOT_DE_PASSE = 'secret123';

const comptes = {}; // { organisateurA, organisateurB, spectateur } -> { id, token }
let salleA;
let evenementA;
let siegeA;

function email(nom) {
  return `${nom}-${SUFFIXE}@test.local`;
}

async function inscrireEtConnecter(nom, role) {
  const inscription = await request(app)
    .post('/api/auth/register')
    .send({ email: email(nom), motDePasse: MOT_DE_PASSE, nom: 'Test', prenom: nom, role });
  expect(inscription.status).toBe(201);

  const connexion = await request(app).post('/api/auth/login').send({ email: email(nom), password: MOT_DE_PASSE });
  expect(connexion.status).toBe(200);
  return { id: inscription.body.data.id, token: connexion.body.data.token };
}

function en(compte) {
  return { Authorization: `Bearer ${comptes[compte].token}` };
}

function dansUneSemaine() {
  return new Date(Date.now() + 7 * 86400_000).toISOString();
}

beforeAll(async () => {
  comptes.organisateurA = await inscrireEtConnecter('organisateur-a', 'organisateur');
  comptes.organisateurB = await inscrireEtConnecter('organisateur-b', 'organisateur');
  comptes.spectateur = await inscrireEtConnecter('spectateur', 'spectateur');

  const salle = await request(app)
    .post('/api/salles')
    .set(en('organisateurA'))
    .send({ nom: `Salle A ${SUFFIXE}`, nombreRangees: 1, siegesParRangee: 2 });
  expect(salle.status).toBe(201);
  salleA = salle.body.data;
  [siegeA] = salleA.sieges;

  const evenement = await request(app)
    .post('/api/evenements')
    .set(en('organisateurA'))
    .send({ salleId: salleA.id, titre: `Événement A ${SUFFIXE}`, dateHeure: dansUneSemaine(), tarif: 10 });
  expect(evenement.status).toBe(201);
  evenementA = evenement.body.data;
});

afterAll(async () => {
  // Sans casse même si un test a échoué avant d'avoir tout créé.
  const ids = Object.values(comptes).map((c) => c.id);
  const intrus = await prisma.utilisateur.findMany({ where: { email: { endsWith: `-${SUFFIXE}@test.local` } } });
  ids.push(...intrus.map((u) => u.id));

  await prisma.reservation.deleteMany({ where: { spectateurId: { in: ids } } });
  await prisma.evenement.deleteMany({ where: { organisateurId: { in: ids } } });
  await prisma.siege.deleteMany({ where: { salle: { organisateurId: { in: ids } } } });
  await prisma.salle.deleteMany({ where: { organisateurId: { in: ids } } });
  await prisma.utilisateur.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('inscription', () => {
  it("refuse de créer un compte administrateur et n'écrit rien en base", async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: email('pirate-admin'), motDePasse: MOT_DE_PASSE, nom: 'Test', prenom: 'Pirate', role: 'administrateur' });

    expect(res.status).toBe(400);
    expect(await prisma.utilisateur.findUnique({ where: { email: email('pirate-admin') } })).toBeNull();
  });

  it('ignore un id imposé dans le corps de la requête', async () => {
    const idImpose = 2_000_000_000;

    const res = await request(app)
      .post('/api/auth/register')
      .send({ id: idImpose, email: email('pirate-id'), motDePasse: MOT_DE_PASSE, nom: 'Test', prenom: 'Pirate', role: 'spectateur' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe(idImpose);
    expect(await prisma.utilisateur.findUnique({ where: { id: idImpose } })).toBeNull();
  });
});

describe('un spectateur ne peut pas agir comme organisateur', () => {
  it("refuse la création d'une salle (403) et n'écrit rien en base", async () => {
    const nom = `Salle pirate ${SUFFIXE}`;

    const res = await request(app)
      .post('/api/salles')
      .set(en('spectateur'))
      .send({ nom, nombreRangees: 1, siegesParRangee: 1, role: 'organisateur' });

    expect(res.status).toBe(403);
    expect(await prisma.salle.count({ where: { nom } })).toBe(0);
  });

  it("refuse la création d'un événement (403) et n'écrit rien en base", async () => {
    const titre = `Événement pirate ${SUFFIXE}`;

    const res = await request(app)
      .post('/api/evenements')
      .set(en('spectateur'))
      .send({ salleId: salleA.id, titre, dateHeure: dansUneSemaine(), tarif: 0 });

    expect(res.status).toBe(403);
    expect(await prisma.evenement.count({ where: { titre } })).toBe(0);
  });

  it('refuse la consultation des ventes (403)', async () => {
    const res = await request(app).get(`/api/evenements/${evenementA.id}/ventes`).set(en('spectateur'));

    expect(res.status).toBe(403);
  });

  it('refuse la liste des salles (403)', async () => {
    const res = await request(app).get('/api/salles').set(en('spectateur'));

    expect(res.status).toBe(403);
  });
});

describe('un organisateur ne peut pas agir comme spectateur', () => {
  it('refuse une réservation (403) et le siège reste libre', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set(en('organisateurA'))
      .send({ evenementId: evenementA.id, siegeIds: [siegeA.id] });

    expect(res.status).toBe(403);
    expect(await prisma.reservation.count({ where: { evenementId: evenementA.id } })).toBe(0);
  });
});

describe('un organisateur ne peut pas toucher aux ressources d’un autre organisateur', () => {
  it("refuse les ventes d'un événement qui n'est pas le sien (403)", async () => {
    const res = await request(app).get(`/api/evenements/${evenementA.id}/ventes`).set(en('organisateurB'));

    expect(res.status).toBe(403);
  });

  it("refuse de créer un événement dans la salle d'un autre (403) et n'écrit rien en base", async () => {
    const titre = `Événement salle volée ${SUFFIXE}`;

    const res = await request(app)
      .post('/api/evenements')
      .set(en('organisateurB'))
      .send({ salleId: salleA.id, titre, dateHeure: dansUneSemaine(), tarif: 0 });

    expect(res.status).toBe(403);
    expect(await prisma.evenement.count({ where: { titre } })).toBe(0);
  });

  it("ne voit pas les salles d'un autre", async () => {
    const res = await request(app).get('/api/salles').set(en('organisateurB'));

    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.id)).not.toContain(salleA.id);
  });

  it('crée la salle à son nom même si le corps désigne un autre organisateur', async () => {
    const res = await request(app)
      .post('/api/salles')
      .set(en('organisateurB'))
      .send({ nom: `Salle B ${SUFFIXE}`, nombreRangees: 1, siegesParRangee: 1, organisateurId: comptes.organisateurA.id });

    expect(res.status).toBe(201);
    const enBase = await prisma.salle.findUnique({ where: { id: res.body.data.id } });
    expect(enBase.organisateurId).toBe(comptes.organisateurB.id);
  });
});

describe('un spectateur ne peut pas réserver au nom de quelqu’un d’autre', () => {
  afterEach(async () => {
    await prisma.reservation.deleteMany({ where: { evenementId: evenementA.id } });
  });

  it('enregistre la réservation au nom du token, pas du spectateurId envoyé', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set(en('spectateur'))
      .send({ evenementId: evenementA.id, siegeIds: [siegeA.id], spectateurId: comptes.organisateurA.id });

    expect(res.status).toBe(201);
    const enBase = await prisma.reservation.findMany({ where: { evenementId: evenementA.id } });
    expect(enBase.map((r) => r.spectateurId)).toEqual([comptes.spectateur.id]);
  });
});

describe('un token falsifié est refusé avant toute écriture', () => {
  it('refuse un token dont le rôle a été modifié après signature (401)', async () => {
    const [entete, payload, signature] = comptes.spectateur.token.split('.');
    const original = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const modifie = Buffer.from(JSON.stringify({ ...original, role: 'organisateur' })).toString('base64url');
    const nom = `Salle token modifié ${SUFFIXE}`;

    const res = await request(app)
      .post('/api/salles')
      .set('Authorization', `Bearer ${entete}.${modifie}.${signature}`)
      .send({ nom, nombreRangees: 1, siegesParRangee: 1 });

    expect(res.status).toBe(401);
    expect(await prisma.salle.count({ where: { nom } })).toBe(0);
  });

  it('refuse un token organisateur signé avec une autre clé (401)', async () => {
    const forge = jwt.sign({ userId: comptes.organisateurA.id, role: 'organisateur' }, 'cle-du-pirate');

    const res = await request(app).get(`/api/evenements/${evenementA.id}/ventes`).set('Authorization', `Bearer ${forge}`);

    expect(res.status).toBe(401);
  });
});

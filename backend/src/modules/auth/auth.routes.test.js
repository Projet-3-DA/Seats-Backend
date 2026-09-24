const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

function inscriptionValide(overrides = {}) {
  return {
    email: 'a@exemple.com',
    motDePasse: 'secret123',
    nom: 'Dupont',
    prenom: 'Jean',
    role: 'spectateur',
    ...overrides,
  };
}

for (const champ of ['email', 'motDePasse', 'nom', 'prenom', 'role']) {
  test(`POST /api/auth/register refuse si "${champ}" est manquant (400)`, async (t) => {
    const creation = prisma.utilisateur.create = t.mock.fn(async () => {
      throw new Error('ne devrait pas être appelé');
    });

    const res = await request(app).post('/api/auth/register').send(inscriptionValide({ [champ]: undefined }));

    assert.equal(res.status, 400);
    assert.match(res.body.error, new RegExp(champ));
    assert.equal(creation.mock.callCount(), 0);
  });
}

test("POST /api/auth/register hache le mot de passe avant de l'enregistrer, et ne le renvoie jamais", async (t) => {
  prisma.utilisateur.create = t.mock.fn(async ({ data }) => ({ id: 1, ...data }));

  const res = await request(app).post('/api/auth/register').send(inscriptionValide());

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.motDePasse, undefined);
});

test('POST /api/auth/register traduit un email déjà utilisé en 409', async (t) => {
  prisma.utilisateur.create = t.mock.fn(async () => {
    throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
  });

  const res = await request(app).post('/api/auth/register').send(inscriptionValide());

  assert.equal(res.status, 409);
  assert.match(res.body.error, /existe déjà/);
});

test('POST /api/auth/register renvoie 500 pour une erreur inattendue de la base', async (t) => {
  t.mock.method(console, 'error', () => {});
  prisma.utilisateur.create = t.mock.fn(async () => {
    throw new Error('boum');
  });

  const res = await request(app).post('/api/auth/register').send(inscriptionValide());

  assert.equal(res.status, 500);
});

async function utilisateurAvecMotDePasse(motDePasse, overrides = {}) {
  return {
    id: 1,
    email: 'a@exemple.com',
    motDePasse: await bcrypt.hash(motDePasse, 4),
    nom: 'Dupont',
    prenom: 'Jean',
    role: 'spectateur',
    ...overrides,
  };
}

test('POST /api/auth/login connecte avec les bons identifiants : token JWT valide, mot de passe absent', async (t) => {
  prisma.utilisateur.findUnique = t.mock.fn(async () => utilisateurAvecMotDePasse('secret123'));

  const res = await request(app).post('/api/auth/login').send({ email: 'a@exemple.com', password: 'secret123' });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.id, 1);
  assert.equal(res.body.data.user.email, 'a@exemple.com');
  assert.equal(res.body.data.user.motDePasse, undefined);

  const payload = jwt.verify(res.body.data.token, jwtSecret);
  assert.equal(payload.userId, 1);
  assert.equal(payload.role, 'spectateur');
});

test('POST /api/auth/login refuse avec 401 (message générique) un email inconnu', async (t) => {
  prisma.utilisateur.findUnique = t.mock.fn(async () => null);

  const res = await request(app).post('/api/auth/login').send({ email: 'inconnu@exemple.com', password: 'x' });

  assert.equal(res.status, 401);
  assert.match(res.body.error, /invalide/);
});

test('POST /api/auth/login refuse avec 401 (même message générique) un mauvais mot de passe', async (t) => {
  prisma.utilisateur.findUnique = t.mock.fn(async () => utilisateurAvecMotDePasse('secret123'));

  const res = await request(app).post('/api/auth/login').send({ email: 'a@exemple.com', password: 'mauvais' });

  assert.equal(res.status, 401);
  assert.match(res.body.error, /invalide/);
});

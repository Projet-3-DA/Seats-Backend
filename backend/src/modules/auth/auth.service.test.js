const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');
const { register, login } = require('./auth.service');

// Les 4 test.todo précédents sont maintenant couverts ci-dessous : register()/login() ne sont plus
// des TODO, ils hachent le mot de passe et gèrent le JWT pour de vrai (#1, #28).
//
// prisma.utilisateur est un Proxy : son descripteur de propriété renvoie toujours `value: undefined`,
// ce qui casse t.mock.method(). On remplace donc la méthode par simple affectation (t.mock.fn() donne
// le même suivi des appels, .mock.calls etc.).

test('register() hache le mot de passe avant de le stocker, et ne le renvoie jamais', async (t) => {
  const data = { email: 'a@b.com', motDePasse: 'secret', nom: 'D', prenom: 'J', role: 'spectateur' };
  const creation = prisma.utilisateur.create = t.mock.fn(async (args) => ({ id: 1, ...args.data }));

  const cree = await register(data);

  assert.equal(cree.motDePasse, undefined);
  const donneesEnvoyees = creation.mock.calls[0].arguments[0].data;
  assert.notEqual(donneesEnvoyees.motDePasse, 'secret');
  assert.equal(await bcrypt.compare('secret', donneesEnvoyees.motDePasse), true);
});

test('register() rejette un champ requis manquant', async () => {
  await assert.rejects(
    () => register({ email: 'a@b.com', nom: 'D', prenom: 'J', role: 'spectateur' }),
    (err) => err.status === 400 && /motDePasse/.test(err.message),
  );
});

test('register() rejette un courriel déjà utilisé, avec un message clair', async (t) => {
  prisma.utilisateur.create = t.mock.fn(async () => {
    throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
  });

  await assert.rejects(
    () => register({ email: 'a@b.com', motDePasse: 'secret', nom: 'D', prenom: 'J', role: 'spectateur' }),
    (err) => err.status === 409 && /existe déjà/.test(err.message),
  );
});

test('login() génère un token JWT à la connexion réussie, sans le mot de passe', async (t) => {
  const hash = await bcrypt.hash('secret', 4);
  prisma.utilisateur.findUnique = t.mock.fn(async (args) => {
    assert.deepEqual(args, { where: { email: 'a@b.com' } });
    return { id: 1, email: 'a@b.com', motDePasse: hash, role: 'spectateur' };
  });

  const resultat = await login('a@b.com', 'secret');

  assert.equal(resultat.user.motDePasse, undefined);
  const payload = jwt.verify(resultat.token, jwtSecret); // lève si signature/expiration invalide
  assert.equal(payload.userId, 1);
  assert.equal(payload.role, 'spectateur');
  assert.equal(payload.exp - payload.iat, 3600); // expiresIn: '1h'
});

test("login() rejette (401 générique) un courriel qui n'existe pas", async (t) => {
  prisma.utilisateur.findUnique = t.mock.fn(async () => null);

  await assert.rejects(() => login('inconnu@b.com', 'x'), (err) => err.status === 401 && /invalide/.test(err.message));
});

test('login() rejette (même 401 générique) un mot de passe incorrect, sans révéler que le courriel existe', async (t) => {
  const hash = await bcrypt.hash('secret', 4);
  prisma.utilisateur.findUnique = t.mock.fn(async () => ({ id: 1, email: 'a@b.com', motDePasse: hash }));

  await assert.rejects(() => login('a@b.com', 'mauvais'), (err) => err.status === 401 && /invalide/.test(err.message));
});

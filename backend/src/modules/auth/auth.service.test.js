const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { register, login } = require('./auth.service');

// À écrire une fois la logique implémentée (auth.service.js a encore des TODO) :
test.todo('register() hache le mot de passe avant de le stocker (#1)');
test.todo('register() rejette un courriel déjà utilisé, avec un message clair (#1)');
test.todo("login() rejette un mot de passe incorrect sans révéler si le courriel existe (#28)");
test.todo("login() génère un token JWT à la connexion réussie (#28)");

test('register() crée un utilisateur avec les données fournies', async (t) => {
  const data = { email: 'a@b.com', motDePasse: 'secret', nom: 'D', prenom: 'J', role: 'spectateur' };
  const created = { id: 1, ...data };
  prisma.utilisateur.create = t.mock.fn(async (args) => {
    assert.deepEqual(args, { data });
    return created;
  });

  assert.deepEqual(await register(data), created);
});

test("login() recherche l'utilisateur par email", async (t) => {
  const user = { id: 1, email: 'a@b.com', motDePasse: 'hash' };
  prisma.utilisateur.findUnique = t.mock.fn(async (args) => {
    assert.deepEqual(args, { where: { email: 'a@b.com' } });
    return user;
  });

  assert.deepEqual(await login('a@b.com', 'secret'), user);
});

test("login() retourne null si aucun utilisateur ne correspond", async (t) => {
  prisma.utilisateur.findUnique = t.mock.fn(async () => null);
  assert.equal(await login('nobody@b.com', 'x'), null);
});

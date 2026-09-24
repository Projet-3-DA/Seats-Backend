const { test } = require('node:test');
const assert = require('node:assert/strict');
const roleMiddleware = require('./role.middleware');

// roleMiddleware n'est câblé sur aucune route pour l'instant (grep confirmé :
// aucun module ne l'importe) — toutes les routes sont actuellement ouvertes.
// À écrire une fois câblé, en tests d'intégration HTTP directs (#9, #33) :
test.todo("POST /api/evenements refuse un spectateur avec 403 (#3, #33)");
test.todo("POST /api/salles refuse un spectateur avec 403 (#33)");
test.todo("les routes d'administration refusent organisateur et spectateur (#19, #33)");

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('rejette quand req.user est manquant', () => {
  const req = {};
  const res = mockRes();
  let nextCalled = false;

  roleMiddleware('administrateur')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("rejette quand le rôle de l'utilisateur n'est pas autorisé", () => {
  const req = { user: { role: 'spectateur' } };
  const res = mockRes();
  let nextCalled = false;

  roleMiddleware('administrateur', 'organisateur')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("appelle next() quand le rôle de l'utilisateur est autorisé", () => {
  const req = { user: { role: 'organisateur' } };
  const res = mockRes();
  let nextCalled = false;

  roleMiddleware('administrateur', 'organisateur')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

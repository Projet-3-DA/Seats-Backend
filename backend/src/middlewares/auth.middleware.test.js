const { test } = require('node:test');
const assert = require('node:assert/strict');
const authMiddleware = require('./auth.middleware');

// À écrire une fois le JWT vérifié (le middleware ne fait encore que checker
// la présence du header, voir le TODO dans auth.middleware.js) :
test.todo('rejette un token JWT invalide ou expiré (#9)');
test.todo('injecte req.user à partir du token décodé quand il est valide (#9)');

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test("rejette les requêtes sans en-tête Authorization", () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test("rejette un en-tête qui n'est pas un token Bearer", () => {
  const req = { headers: { authorization: 'Basic abc' } };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('appelle next() quand un token Bearer est présent', () => {
  const req = { headers: { authorization: 'Bearer sometoken' } };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

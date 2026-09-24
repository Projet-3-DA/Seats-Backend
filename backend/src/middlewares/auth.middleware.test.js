const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const authMiddleware = require('./auth.middleware');

// Les 2 test.todo précédents ("rejette un token JWT invalide ou expiré", "injecte req.user à partir
// du token décodé") sont maintenant couverts ci-dessous : la vérification JWT est faite (#9).

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function jeton(payload, options) {
  return jwt.sign(payload, jwtSecret, options);
}

test('rejette les requêtes sans en-tête Authorization', () => {
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

test('rejette un token invalide (signature incorrecte)', () => {
  const req = { headers: { authorization: 'Bearer un-token-invalide' } };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('rejette un token expiré', () => {
  const token = jeton({ userId: 1, role: 'spectateur' }, { expiresIn: -10 });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('rejette un token signé avec une autre clé', () => {
  const token = jwt.sign({ userId: 1, role: 'spectateur' }, 'une-autre-cle');
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('accepte un token valide, remplit req.user et appelle next()', () => {
  const token = jeton({ userId: 42, role: 'organisateur' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, undefined);
  assert.deepEqual(req.user, { id: 42, role: 'organisateur' });
});

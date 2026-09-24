const { test } = require('node:test');
const assert = require('node:assert/strict');
const errorMiddleware = require('./error.middleware');

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test("utilise le status/message de l'erreur quand ils sont présents", (t) => {
  t.mock.method(console, 'error', () => {});
  const res = mockRes();

  errorMiddleware({ status: 404, message: 'Introuvable' }, {}, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, error: 'Introuvable' });
});

test('utilise 500 et un message générique par défaut', (t) => {
  t.mock.method(console, 'error', () => {});
  const res = mockRes();

  errorMiddleware({}, {}, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Erreur interne du serveur');
});

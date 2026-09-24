const { test } = require('node:test');
const assert = require('node:assert/strict');
const httpError = require('./http-error');

test('crée une Error avec le message donné', () => {
  const err = httpError(404, 'Introuvable');
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'Introuvable');
});

test('attache le status à l\'erreur', () => {
  const err = httpError(403, 'Interdit');
  assert.equal(err.status, 403);
});

test('produit des erreurs indépendantes à chaque appel', () => {
  const a = httpError(400, 'a');
  const b = httpError(500, 'b');
  assert.notEqual(a, b);
  assert.equal(a.status, 400);
  assert.equal(b.status, 500);
});

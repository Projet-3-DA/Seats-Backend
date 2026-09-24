const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./app');

test('GET / renvoie l\'état de santé de l\'API', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.message, 'string');
});

test('autorise les requêtes cross-origin (CORS)', async () => {
  const res = await request(app).get('/').set('Origin', 'http://localhost:8081');
  assert.notEqual(res.headers['access-control-allow-origin'], undefined);
});

test("renvoie 404 pour une route qui n'existe pas", async () => {
  const res = await request(app).get('/api/route-inexistante');
  assert.equal(res.status, 404);
});

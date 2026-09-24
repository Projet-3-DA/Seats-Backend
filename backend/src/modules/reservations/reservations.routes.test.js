// Couverture volontairement légère : createReservation est marqué TODO dans le code (pas de gestion du
// conflit de siège ni du délai d'expiration). Ces tests protègent le câblage des routes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');

test("GET /api/reservations utilise l'utilisateur 1 par défaut tant que l'authentification n'est pas branchée", async (t) => {
  const liste = [{ id: 1, spectateurId: 1 }];
  const recherche = prisma.reservation.findMany = t.mock.fn(async () => liste);

  const res = await request(app).get('/api/reservations');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, data: liste });
  assert.deepEqual(recherche.mock.calls[0].arguments[0].where, { spectateurId: 1 });
});

test('POST /api/reservations crée la réservation et renvoie 201', async (t) => {
  const reservation = { id: 1, spectateurId: 1, siegeId: 101, evenementId: 1, statut: 'en_selection' };
  prisma.reservation.create = t.mock.fn(async () => reservation);

  const res = await request(app)
    .post('/api/reservations')
    .send({ spectateurId: 1, siegeId: 101, evenementId: 1, statut: 'en_selection' });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { success: true, data: reservation });
});

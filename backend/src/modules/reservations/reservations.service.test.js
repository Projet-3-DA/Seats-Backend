const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { getReservationsByUser, createReservation } = require('./reservations.service');

// À écrire une fois la logique implémentée (reservations.service.js a encore des TODO) :
test.todo('createReservation() refuse un siège déjà réservé ou en sélection (#26, #30, #31)');
test.todo("createReservation() respecte l'unicité (siegeId, evenementId) sous confirmation concurrente (#16, #27, #38)");
test.todo('createReservation() libère le siège si la sélection expire sans confirmation (#15, #32)');
test.todo('cancelReservation() libère les sièges et refuse si la réservation ne m\'appartient pas (#12)');
test.todo("cancelReservation() permet à l'organisateur d'annuler une réservation de ses événements (#14)");
test.todo("getReservationsByUser() étiquette une réservation d'événement passé comme terminée (#7)");

test('getReservationsByUser() liste les réservations d\'un spectateur', async (t) => {
  const rows = [{ id: 1, spectateurId: 5, evenement: {}, siege: {} }];
  prisma.reservation.findMany = t.mock.fn(async (args) => {
    assert.deepEqual(args, {
      where: { spectateurId: 5 },
      include: { evenement: true, siege: true },
    });
    return rows;
  });

  assert.deepEqual(await getReservationsByUser(5), rows);
});

test('createReservation() crée une réservation avec les données fournies', async (t) => {
  const data = { spectateurId: 5, siegeId: 2, evenementId: 1, statut: 'en_selection', delaiExpiration: new Date() };
  const created = { id: 1, ...data };
  prisma.reservation.create = t.mock.fn(async (args) => {
    assert.deepEqual(args, { data });
    return created;
  });

  assert.deepEqual(await createReservation(data), created);
});

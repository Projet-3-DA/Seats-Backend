jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getReservationsByUser, createReservation } = require('./reservations.service');

it.todo('createReservation() refuse un siège déjà réservé ou en sélection (#26, #30, #31)');
it.todo("createReservation() respecte l'unicité (siegeId, evenementId) sous confirmation concurrente (#16, #27, #38)");
it.todo('createReservation() libère le siège si la sélection expire sans confirmation (#15, #32)');
it.todo('cancelReservation() libère les sièges et refuse si la réservation ne m\'appartient pas (#12)');
it.todo("cancelReservation() permet à l'organisateur d'annuler une réservation de ses événements (#14)");
it.todo("getReservationsByUser() étiquette une réservation d'événement passé comme terminée (#7)");

describe('getReservationsByUser', () => {
  it('liste les réservations d\'un spectateur', async () => {
    const rows = [{ id: 1, spectateurId: 5, evenement: {}, siege: {} }];
    prisma.reservation.findMany.mockResolvedValue(rows);

    await expect(getReservationsByUser(5)).resolves.toEqual(rows);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: { spectateurId: 5 },
      include: { evenement: true, siege: true },
    });
  });
});

describe('createReservation', () => {
  it('crée une réservation avec les données fournies', async () => {
    const data = { spectateurId: 5, siegeId: 2, evenementId: 1, statut: 'en_selection', delaiExpiration: new Date() };
    const created = { id: 1, ...data };
    prisma.reservation.create.mockResolvedValue(created);

    await expect(createReservation(data)).resolves.toEqual(created);
    expect(prisma.reservation.create).toHaveBeenCalledWith({ data });
  });
});

jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getReservationsByUser, reserverSieges } = require('./reservations.service');

it.todo('cancelReservation() libère les sièges et refuse si la réservation ne m\'appartient pas (#12)');
it.todo("cancelReservation() permet à l'organisateur d'annuler une réservation de ses événements (#14)");
it.todo("reserverSieges() empêche de sélectionner un siège déjà en sélection par un autre (#26, #30, #31)");
it.todo('reserverSieges() libère un siège dont la sélection a expiré sans confirmation (#15, #32)');

describe('getReservationsByUser', () => {
  it('liste les réservations d\'un spectateur', async () => {
    const rows = [{ id: 1, spectateurId: 5, evenement: { dateHeure: new Date(Date.now() + 86_400_000) }, siege: {} }];
    prisma.reservation.findMany.mockResolvedValue(rows);

    await expect(getReservationsByUser(5)).resolves.toEqual([{ ...rows[0], terminee: false }]);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: { spectateurId: 5 },
      include: { evenement: true, siege: true },
    });
  });

  it("étiquette une réservation d'événement passé comme terminée (#7)", async () => {
    const rows = [{ id: 2, spectateurId: 5, evenement: { dateHeure: new Date(Date.now() - 86_400_000) }, siege: {} }];
    prisma.reservation.findMany.mockResolvedValue(rows);

    await expect(getReservationsByUser(5)).resolves.toEqual([{ ...rows[0], terminee: true }]);
  });
});

describe('reserverSieges', () => {
  const evenement = {
    id: 1,
    salle: { sieges: [{ id: 101 }, { id: 102 }, { id: 103 }] },
  };

  function attendreSieges(overrides = {}) {
    return { spectateurId: 5, evenementId: 1, siegeIds: [101, 102], ...overrides };
  }

  it('réserve tous les sièges demandés en une seule transaction', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    const creees = [
      { id: 1, spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'en_selection' },
      { id: 2, spectateurId: 5, siegeId: 102, evenementId: 1, statut: 'en_selection' },
    ];
    prisma.reservation.create.mockResolvedValueOnce(creees[0]).mockResolvedValueOnce(creees[1]);

    await expect(reserverSieges(attendreSieges())).resolves.toEqual(creees);

    expect(prisma.reservation.create).toHaveBeenCalledTimes(2);
    expect(prisma.reservation.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'en_selection' }),
    });
    expect(prisma.reservation.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ spectateurId: 5, siegeId: 102, evenementId: 1, statut: 'en_selection' }),
    });
  });

  it("refuse si l'événement n'existe pas", async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    await expect(reserverSieges(attendreSieges())).rejects.toMatchObject({ status: 404 });
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it("refuse un siège n'appartenant pas à la salle de l'événement", async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    await expect(reserverSieges(attendreSieges({ siegeIds: [101, 999] }))).rejects.toMatchObject({ status: 400 });
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it("respecte l'unicité (siegeId, evenementId) sous confirmation concurrente (#16, #27, #38)", async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    prisma.reservation.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));

    await expect(reserverSieges(attendreSieges())).rejects.toMatchObject({ status: 409 });
  });
});

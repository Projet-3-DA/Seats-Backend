jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getReservationsByUser, reserverSieges, annulerReservation } = require('./reservations.service');

it.todo('cancelReservation() libère les sièges et refuse si la réservation ne m\'appartient pas (#12)');
it.todo("reserverSieges() empêche de sélectionner un siège déjà en sélection par un autre (#26, #30, #31)");
it.todo('reserverSieges() libère un siège dont la sélection a expiré sans confirmation (#15, #32)');

describe('getReservationsByUser', () => {
  it('liste les réservations d\'un spectateur', async () => {
    const rows = [{ id: 1, spectateurId: 5, evenement: { dateHeure: new Date(Date.now() + 86_400_000) }, siege: {} }];
    prisma.reservation.findMany.mockResolvedValue(rows);

    await expect(getReservationsByUser(5)).resolves.toEqual([{ ...rows[0], prix: null, terminee: false }]);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: { spectateurId: 5 },
      include: { evenement: true, siege: { include: { section: true } } },
    });
  });

  it("étiquette une réservation d'événement passé comme terminée (#7)", async () => {
    const rows = [{ id: 2, spectateurId: 5, evenement: { dateHeure: new Date(Date.now() - 86_400_000) }, siege: {} }];
    prisma.reservation.findMany.mockResolvedValue(rows);

    await expect(getReservationsByUser(5)).resolves.toEqual([{ ...rows[0], prix: null, terminee: true }]);
  });
});

describe('reserverSieges', () => {
  const evenement = {
    id: 1,
    dateHeure: new Date(Date.now() + 86_400_000),
    salle: { sieges: [{ id: 101 }, { id: 102 }, { id: 103 }] },
  };

  function attendreSieges(overrides = {}) {
    return { spectateurId: 5, evenementId: 1, siegeIds: [101, 102], ...overrides };
  }

  it('réserve tous les sièges demandés en une seule transaction', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    const creees = [
      { id: 1, spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'confirmee' },
      { id: 2, spectateurId: 5, siegeId: 102, evenementId: 1, statut: 'confirmee' },
    ];
    prisma.reservation.create.mockResolvedValueOnce(creees[0]).mockResolvedValueOnce(creees[1]);

    await expect(reserverSieges(attendreSieges())).resolves.toEqual(creees);

    expect(prisma.reservation.create).toHaveBeenCalledTimes(2);
    expect(prisma.reservation.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'confirmee' }),
    });
    expect(prisma.reservation.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ spectateurId: 5, siegeId: 102, evenementId: 1, statut: 'confirmee' }),
    });
  });

  it('enregistre la date de confirmation avec la réservation', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    prisma.reservation.create.mockResolvedValue({ id: 1 });

    await reserverSieges(attendreSieges({ siegeIds: [101] }));

    expect(prisma.reservation.create.mock.calls[0][0].data.dateConfirmation).toBeInstanceOf(Date);
  });

  it('libère avant de créer les anciennes sélections expirées des sièges demandés', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    prisma.reservation.create.mockResolvedValue({ id: 1 });

    await reserverSieges(attendreSieges({ siegeIds: [101, 102] }));

    expect(prisma.reservation.deleteMany).toHaveBeenCalledWith({
      where: {
        evenementId: 1,
        siegeId: { in: [101, 102] },
        statut: 'en_selection',
        delaiExpiration: { lte: expect.any(Date) },
      },
    });
  });

  it('ne renvoie que les réservations créées, pas le résultat du nettoyage', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    prisma.reservation.deleteMany.mockResolvedValue({ count: 3 });
    prisma.reservation.create.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 });

    await expect(reserverSieges(attendreSieges())).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("refuse si l'événement n'existe pas", async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    await expect(reserverSieges(attendreSieges())).rejects.toMatchObject({ status: 404 });
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it('refuse (400) la réservation d\'un événement déjà passé (#82)', async () => {
    prisma.evenement.findUnique.mockResolvedValue({ ...evenement, dateHeure: new Date(Date.now() - 86_400_000) });

    await expect(reserverSieges(attendreSieges())).rejects.toMatchObject({
      status: 400,
      message: 'Cet événement est déjà passé.',
    });
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

describe('annulerReservation (#14)', () => {
  const reservation = { id: 5, statut: 'confirmee', evenement: { id: 1, organisateurId: 7 } };

  it("annule la réservation, garde l'historique et libère le siège", async () => {
    prisma.reservation.findUnique
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ id: 5, statut: 'annulee', motifAnnulation: 'Doublon', actif: null });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    const annulee = await annulerReservation({ reservationId: 5, organisateurId: 7, motif: 'Doublon' });

    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 5, statut: { not: 'annulee' } },
      data: { statut: 'annulee', actif: null, motifAnnulation: 'Doublon', dateAnnulation: expect.any(Date) },
    });
    expect(annulee).toMatchObject({ statut: 'annulee', motifAnnulation: 'Doublon' });
  });

  it('accepte une annulation sans motif (motif enregistré à null)', async () => {
    prisma.reservation.findUnique.mockResolvedValueOnce(reservation).mockResolvedValueOnce({ id: 5 });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    await annulerReservation({ reservationId: 5, organisateurId: 7 });

    expect(prisma.reservation.updateMany.mock.calls[0][0].data.motifAnnulation).toBeNull();
  });

  it("refuse (404) une réservation qui n'existe pas", async () => {
    prisma.reservation.findUnique.mockResolvedValue(null);

    await expect(annulerReservation({ reservationId: 999, organisateurId: 7 })).rejects.toMatchObject({ status: 404 });
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it("refuse (403) la réservation de l'événement d'un autre organisateur", async () => {
    prisma.reservation.findUnique.mockResolvedValue(reservation);

    await expect(annulerReservation({ reservationId: 5, organisateurId: 8 })).rejects.toMatchObject({ status: 403 });
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('refuse (409) une réservation déjà annulée', async () => {
    prisma.reservation.findUnique.mockResolvedValue({ ...reservation, statut: 'annulee' });
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });

    await expect(annulerReservation({ reservationId: 5, organisateurId: 7 })).rejects.toMatchObject({ status: 409 });
  });
});

describe('getReservationsByUser : prix de la place (#11)', () => {
  it("renvoie le prix de la section du siège, sinon le tarif de l'événement", async () => {
    const evenement = { dateHeure: new Date(Date.now() + 86_400_000), tarif: '25.00' };
    prisma.reservation.findMany.mockResolvedValue([
      { id: 1, evenement, siege: { id: 101, section: { prix: '40.00' } } },
      { id: 2, evenement, siege: { id: 102, section: null } },
    ]);

    const reservations = await getReservationsByUser(5);

    expect(reservations.map((r) => r.prix)).toEqual([40, 25]);
  });
});

jest.mock('../../lib/prisma');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

function jeton(payload) {
  return jwt.sign(payload, jwtSecret);
}

describe('GET /api/reservations', () => {
  it('refuse sans authentification (401)', async () => {
    const res = await request(app).get('/api/reservations');
    expect(res.status).toBe(401);
  });

  it('renvoie les réservations du spectateur authentifié', async () => {
    const liste = [{ id: 1, spectateurId: 5, evenement: { dateHeure: new Date(Date.now() + 86_400_000) }, siege: {} }];
    prisma.reservation.findMany.mockResolvedValue(liste);

    const res = await request(app)
      .get('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [{ ...liste[0], evenement: { dateHeure: liste[0].evenement.dateHeure.toISOString() }, prix: null, terminee: false }],
    });
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spectateurId: 5 } }),
    );
  });
});

describe('POST /api/reservations', () => {
  const corps = { evenementId: 1, siegeIds: [101, 102] };
  const evenement = { id: 1, salle: { sieges: [{ id: 101 }, { id: 102 }] } };

  it('refuse sans authentification (401)', async () => {
    const res = await request(app).post('/api/reservations').send(corps);
    expect(res.status).toBe(401);
  });

  it('refuse un organisateur (403)', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 9, role: 'organisateur' })}`)
      .send(corps);
    expect(res.status).toBe(403);
  });

  it('refuse un corps invalide (400)', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send({ evenementId: 1, siegeIds: [] });
    expect(res.status).toBe(400);
  });

  it('réserve les sièges pour le spectateur authentifié et renvoie 201', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    prisma.reservation.findMany.mockResolvedValue([]);
    const creees = [
      { id: 1, spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'confirmee' },
      { id: 2, spectateurId: 5, siegeId: 102, evenementId: 1, statut: 'confirmee' },
    ];
    prisma.reservation.create.mockResolvedValueOnce(creees[0]).mockResolvedValueOnce(creees[1]);

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send(corps);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: creees });
    expect(prisma.reservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ spectateurId: 5, siegeId: 101 }),
    });
  });

  it('refuse avec un message explicite si un siège a été pris entretemps (#26)', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.reservation.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send(corps);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'Un ou plusieurs sièges viennent d\'être pris.' });
  });
});

describe('POST /api/reservations/:id/annulation (#14)', () => {
  const orga = () => `Bearer ${jeton({ userId: 7, role: 'organisateur' })}`;
  const reservation = { id: 5, statut: 'confirmee', evenement: { id: 1, organisateurId: 7 } };

  it('refuse sans authentification (401)', async () => {
    const res = await request(app).post('/api/reservations/5/annulation').send({});
    expect(res.status).toBe(401);
  });

  it('refuse un spectateur (403)', async () => {
    const res = await request(app)
      .post('/api/reservations/5/annulation')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send({});
    expect(res.status).toBe(403);
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un id non numérique (400)', async () => {
    const res = await request(app).post('/api/reservations/abc/annulation').set('Authorization', orga()).send({});
    expect(res.status).toBe(400);
  });

  it('refuse un motif invalide (400)', async () => {
    const res = await request(app)
      .post('/api/reservations/5/annulation')
      .set('Authorization', orga())
      .send({ motif: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(prisma.reservation.findUnique).not.toHaveBeenCalled();
  });

  it("refuse la réservation de l'événement d'un autre organisateur (403)", async () => {
    prisma.reservation.findUnique.mockResolvedValue({ ...reservation, evenement: { id: 1, organisateurId: 8 } });

    const res = await request(app).post('/api/reservations/5/annulation').set('Authorization', orga()).send({});

    expect(res.status).toBe(403);
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('annule la réservation avec le motif nettoyé (200)', async () => {
    prisma.reservation.findUnique
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ id: 5, statut: 'annulee', motifAnnulation: 'Erreur de siège' });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/reservations/5/annulation')
      .set('Authorization', orga())
      .send({ motif: '  Erreur de siège  ' });

    expect(res.status).toBe(200);
    expect(res.body.data.statut).toBe('annulee');
    expect(prisma.reservation.updateMany.mock.calls[0][0].data.motifAnnulation).toBe('Erreur de siège');
  });

  it('accepte une annulation sans corps de requête', async () => {
    prisma.reservation.findUnique.mockResolvedValueOnce(reservation).mockResolvedValueOnce({ id: 5 });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app).post('/api/reservations/5/annulation').set('Authorization', orga());

    expect(res.status).toBe(200);
  });

  it('renvoie 409 pour une réservation déjà annulée', async () => {
    prisma.reservation.findUnique.mockResolvedValue(reservation);
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app).post('/api/reservations/5/annulation').set('Authorization', orga()).send({});

    expect(res.status).toBe(409);
  });
});

describe('POST /api/reservations/:id/annuler (#12)', () => {
  const spectateur = () => `Bearer ${jeton({ userId: 3, role: 'spectateur' })}`;
  const dateFuture = new Date(Date.now() + 86_400_000);
  const reservation = { id: 5, statut: 'confirmee', spectateurId: 3, evenement: { id: 1, dateHeure: dateFuture } };

  it('refuse sans authentification (401)', async () => {
    const res = await request(app).post('/api/reservations/5/annuler').send({});
    expect(res.status).toBe(401);
  });

  it('refuse un organisateur (403)', async () => {
    const res = await request(app)
      .post('/api/reservations/5/annuler')
      .set('Authorization', `Bearer ${jeton({ userId: 7, role: 'organisateur' })}`)
      .send({});
    expect(res.status).toBe(403);
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it("refuse la réservation d'un autre spectateur (403)", async () => {
    prisma.reservation.findUnique.mockResolvedValue({ ...reservation, spectateurId: 99 });

    const res = await request(app).post('/api/reservations/5/annuler').set('Authorization', spectateur()).send({});

    expect(res.status).toBe(403);
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('refuse une réservation dont l\'événement est déjà passé (400)', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      ...reservation,
      evenement: { id: 1, dateHeure: new Date(Date.now() - 86_400_000) },
    });

    const res = await request(app).post('/api/reservations/5/annuler').set('Authorization', spectateur()).send({});

    expect(res.status).toBe(400);
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('annule la réservation à venir (200)', async () => {
    prisma.reservation.findUnique
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ id: 5, statut: 'annulee', actif: null });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app).post('/api/reservations/5/annuler').set('Authorization', spectateur()).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.statut).toBe('annulee');
  });
});

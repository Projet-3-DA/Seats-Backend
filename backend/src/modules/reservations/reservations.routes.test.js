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
    const liste = [{ id: 1, spectateurId: 5, evenement: { dateHeure: new Date(Date.now() + 86_400_000) } }];
    prisma.reservation.findMany.mockResolvedValue(liste);

    const res = await request(app)
      .get('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [{ ...liste[0], evenement: { dateHeure: liste[0].evenement.dateHeure.toISOString() }, terminee: false }],
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

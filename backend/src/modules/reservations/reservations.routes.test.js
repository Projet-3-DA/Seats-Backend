// Couverture volontairement légère : createReservation est marqué TODO dans le code (pas de gestion du
// conflit de siège ni du délai d'expiration). Ces tests protègent le câblage des routes.
jest.mock('../../lib/prisma');

const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');

describe('GET /api/reservations', () => {
  // Documente l'état actuel : sans authentification branchée, req.user est toujours absent, donc le
  // controller retombe sur l'utilisateur 1 codé en dur (voir reservations.controller.js).
  it('utilise l\'utilisateur 1 par défaut tant que l\'authentification n\'est pas branchée', async () => {
    const liste = [{ id: 1, spectateurId: 1 }];
    prisma.reservation.findMany.mockResolvedValue(liste);

    const res = await request(app).get('/api/reservations');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: liste });
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spectateurId: 1 } }),
    );
  });
});

describe('POST /api/reservations', () => {
  it('crée la réservation et renvoie 201', async () => {
    const reservation = { id: 1, spectateurId: 1, siegeId: 101, evenementId: 1, statut: 'en_selection' };
    prisma.reservation.create.mockResolvedValue(reservation);

    const res = await request(app)
      .post('/api/reservations')
      .send({ spectateurId: 1, siegeId: 101, evenementId: 1, statut: 'en_selection' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: reservation });
  });
});

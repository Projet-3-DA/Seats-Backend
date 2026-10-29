// Vérifie le câblage ajouté pour #35 : après une réservation ou une annulation, le controller recalcule
// les ventes de l'événement et les pousse via realtime.diffuserVentes. Fichier séparé de
// reservations.routes.test.js pour ne pas mélanger ses fixtures (évenement minimal) avec celles,
// complètes, qu'exige calculerVentes() ici.
jest.mock('../../lib/prisma');
jest.mock('../../realtime', () => ({
  estSelectionneParAutre: jest.fn(() => false),
  diffuserReserves: jest.fn(),
  diffuserVentes: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const realtime = require('../../realtime');
const { jwtSecret } = require('../../config/env');

function jeton(payload) {
  return jwt.sign(payload, jwtSecret);
}

function evenementAvecVentes(overrides = {}) {
  return {
    id: 1,
    titre: 'Concert',
    dateHeure: new Date(Date.now() + 86_400_000),
    tarif: 25,
    organisateurId: 7,
    salle: {
      id: 3,
      nom: 'Salle A',
      sieges: [{ id: 101, numeroRangee: 1, numeroColonne: 1, sectionId: null, section: null }],
      sections: [],
    },
    reservations: [],
    ...overrides,
  };
}

describe("diffusion des ventes en direct après une action sur une réservation (#35)", () => {
  it('pousse les ventes à jour après une réservation confirmée', async () => {
    prisma.evenement.findUnique
      .mockResolvedValueOnce({ dateHeure: new Date(Date.now() + 86_400_000), salle: { sieges: [{ id: 101 }] } })
      .mockResolvedValueOnce(evenementAvecVentes());
    prisma.reservation.create.mockResolvedValue({ id: 9, spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'confirmee' });

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send({ evenementId: 1, siegeIds: [101] });

    expect(res.status).toBe(201);
    expect(realtime.diffuserVentes).toHaveBeenCalledTimes(1);
    expect(realtime.diffuserVentes).toHaveBeenCalledWith(1, expect.objectContaining({ totaux: expect.any(Object) }));
  });

  it("pousse les ventes à jour après l'annulation par l'organisateur", async () => {
    prisma.reservation.findUnique
      .mockResolvedValueOnce({ id: 9, statut: 'confirmee', evenementId: 1, evenement: { id: 1, organisateurId: 7 } })
      .mockResolvedValueOnce({ id: 9, statut: 'annulee', evenementId: 1 });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.evenement.findUnique.mockResolvedValueOnce(evenementAvecVentes());

    const res = await request(app)
      .post('/api/reservations/9/annulation')
      .set('Authorization', `Bearer ${jeton({ userId: 7, role: 'organisateur' })}`)
      .send({});

    expect(res.status).toBe(200);
    expect(realtime.diffuserVentes).toHaveBeenCalledWith(1, expect.objectContaining({ totaux: expect.any(Object) }));
  });

  it("pousse les ventes à jour après l'annulation par le spectateur propriétaire (#12)", async () => {
    prisma.reservation.findUnique
      .mockResolvedValueOnce({
        id: 9,
        statut: 'confirmee',
        spectateurId: 5,
        evenementId: 1,
        evenement: { id: 1, dateHeure: new Date(Date.now() + 86_400_000) },
      })
      .mockResolvedValueOnce({ id: 9, statut: 'annulee', evenementId: 1 });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });
    prisma.evenement.findUnique.mockResolvedValueOnce(evenementAvecVentes());

    const res = await request(app)
      .post('/api/reservations/9/annuler')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send({});

    expect(res.status).toBe(200);
    expect(realtime.diffuserVentes).toHaveBeenCalledWith(1, expect.objectContaining({ totaux: expect.any(Object) }));
  });

  it("ne fait pas échouer la réservation si le recalcul des ventes échoue", async () => {
    prisma.evenement.findUnique
      .mockResolvedValueOnce({ dateHeure: new Date(Date.now() + 86_400_000), salle: { sieges: [{ id: 101 }] } })
      .mockRejectedValueOnce(new Error('panne base de données'));
    prisma.reservation.create.mockResolvedValue({ id: 9, spectateurId: 5, siegeId: 101, evenementId: 1, statut: 'confirmee' });

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${jeton({ userId: 5, role: 'spectateur' })}`)
      .send({ evenementId: 1, siegeIds: [101] });

    expect(res.status).toBe(201);
    expect(realtime.diffuserVentes).not.toHaveBeenCalled();
  });
});

jest.mock('../../lib/prisma');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

function auth(role) {
  return `Bearer ${jwt.sign({ userId: 1, role }, jwtSecret)}`;
}

describe.each(['/api/admin/evenements', '/api/admin/evenements/1'])('GET %s (#36)', (chemin) => {
  it('refuse sans authentification (401)', async () => {
    const res = await request(app).get(chemin);

    expect(res.status).toBe(401);
    expect(prisma.evenement.findMany).not.toHaveBeenCalled();
    expect(prisma.evenement.findUnique).not.toHaveBeenCalled();
  });

  it.each(['spectateur', 'organisateur'])('refuse le rôle %s (403)', async (role) => {
    const res = await request(app).get(chemin).set('Authorization', auth(role));

    expect(res.status).toBe(403);
    expect(prisma.evenement.findMany).not.toHaveBeenCalled();
    expect(prisma.evenement.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/evenements (#36)', () => {
  it("renvoie tous les événements à l'administrateur (200)", async () => {
    prisma.evenement.findMany.mockResolvedValue([
      {
        id: 1,
        titre: 'Concert',
        dateHeure: new Date(Date.now() + 86_400_000),
        salle: { id: 3, nom: 'Salle A', _count: { sieges: 20 } },
        organisateur: { id: 7, prenom: 'Org', nom: 'Anisateur', email: 'org@test.local' },
        _count: { reservations: 4 },
      },
    ]);

    const res = await request(app).get('/api/admin/evenements').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 1, vendus: 4, totalSieges: 20, terminee: false, organisateur: expect.any(Object) }),
    ]);
  });
});

describe('GET /api/admin/evenements/:id (#36)', () => {
  it('refuse un id non numérique (400)', async () => {
    const res = await request(app).get('/api/admin/evenements/abc').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(400);
    expect(prisma.evenement.findUnique).not.toHaveBeenCalled();
  });

  it("renvoie 404 si l'événement n'existe pas", async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/admin/evenements/999').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(404);
  });

  it("renvoie le détail d'un événement de n'importe quel organisateur (200)", async () => {
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      organisateurId: 42,
      titre: 'Concert',
      description: null,
      afficheUrl: null,
      createdAt: new Date(),
      dateHeure: new Date(Date.now() + 86_400_000),
      tarif: null,
      organisateur: { id: 42, prenom: 'Autre', nom: 'Org', email: 'autre@test.local' },
      salle: { id: 3, nom: 'Salle A', sieges: [{ id: 11, numeroRangee: 1, numeroColonne: 1 }] },
      reservations: [],
    });

    const res = await request(app).get('/api/admin/evenements/1').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      evenement: { id: 1, titre: 'Concert', terminee: false },
      organisateur: { id: 42 },
      totaux: { total: 1, vendus: 0, enSelection: 0, libres: 1 },
      recette: null,
    });
  });
});

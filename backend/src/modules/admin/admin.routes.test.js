jest.mock('../../lib/prisma');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const { jwtSecret } = require('../../config/env');

function auth(role) {
  return `Bearer ${jwt.sign({ userId: 1, role }, jwtSecret)}`;
}

describe.each(['/api/admin/evenements', '/api/admin/evenements/1', '/api/admin/organisateurs', '/api/admin/organisateurs/1'])('GET %s', (chemin) => {
  it('refuse sans authentification (401)', async () => {
    const res = await request(app).get(chemin);

    expect(res.status).toBe(401);
    expect(prisma.evenement.findMany).not.toHaveBeenCalled();
    expect(prisma.evenement.findUnique).not.toHaveBeenCalled();
    expect(prisma.utilisateur.findMany).not.toHaveBeenCalled();
    expect(prisma.utilisateur.findFirst).not.toHaveBeenCalled();
  });

  it.each(['spectateur', 'organisateur'])('refuse le rôle %s (403)', async (role) => {
    const res = await request(app).get(chemin).set('Authorization', auth(role));

    expect(res.status).toBe(403);
    expect(prisma.evenement.findMany).not.toHaveBeenCalled();
    expect(prisma.evenement.findUnique).not.toHaveBeenCalled();
    expect(prisma.utilisateur.findMany).not.toHaveBeenCalled();
    expect(prisma.utilisateur.findFirst).not.toHaveBeenCalled();
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
      salle: { id: 3, nom: 'Salle A', sieges: [{ id: 11, numeroRangee: 1, numeroColonne: 1 }], sections: [] },
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

describe('GET /api/admin/organisateurs (#15)', () => {
  it("renvoie les organisateurs et leur nombre d'événements à l'administrateur (200)", async () => {
    prisma.utilisateur.findMany.mockResolvedValue([
      { id: 7, prenom: 'Olivia', nom: 'Organisatrice', email: 'o@test.local', createdAt: new Date(), _count: { evenements: 2, salles: 1 } },
    ]);

    const res = await request(app).get('/api/admin/organisateurs').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: 7, email: 'o@test.local', nombreEvenements: 2, nombreSalles: 1 }),
    ]);
  });
});

describe('GET /api/admin/organisateurs/:id (#15)', () => {
  it('refuse un id non numérique (400)', async () => {
    const res = await request(app).get('/api/admin/organisateurs/abc').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(400);
    expect(prisma.utilisateur.findFirst).not.toHaveBeenCalled();
  });

  it("renvoie 404 si ce n'est pas un organisateur", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/admin/organisateurs/5').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(404);
  });

  it("renvoie le détail d'un organisateur (200)", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue({
      id: 7,
      prenom: 'Olivia',
      nom: 'Organisatrice',
      email: 'o@test.local',
      createdAt: new Date(),
      _count: { evenements: 0, salles: 0 },
      salles: [],
      evenements: [],
    });

    const res = await request(app).get('/api/admin/organisateurs/7').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 7, nombreEvenements: 0, salles: [], evenements: [] });
  });
});

describe('GET /api/admin/comptes (#20)', () => {
  it.each(['spectateur', 'organisateur'])('refuse le rôle %s (403)', async (role) => {
    const res = await request(app).get('/api/admin/comptes').set('Authorization', auth(role));

    expect(res.status).toBe(403);
    expect(prisma.utilisateur.findMany).not.toHaveBeenCalled();
  });

  it("renvoie les comptes et leur statut à l'administrateur (200)", async () => {
    prisma.utilisateur.findMany.mockResolvedValue([
      { id: 5, prenom: 'Sam', nom: 'Spectateur', email: 's@test.local', role: 'spectateur', statut: 'actif' },
    ]);

    const res = await request(app).get('/api/admin/comptes').set('Authorization', auth('administrateur'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ id: 5, statut: 'actif' })]);
  });
});

describe('PATCH /api/admin/comptes/:id/statut (#20)', () => {
  it('refuse sans authentification (401)', async () => {
    const res = await request(app).patch('/api/admin/comptes/5/statut').send({ statut: 'suspendu' });

    expect(res.status).toBe(401);
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });

  it.each(['spectateur', 'organisateur'])('refuse le rôle %s (403)', async (role) => {
    const res = await request(app)
      .patch('/api/admin/comptes/5/statut')
      .set('Authorization', auth(role))
      .send({ statut: 'suspendu' });

    expect(res.status).toBe(403);
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });

  it('refuse un id non numérique (400)', async () => {
    const res = await request(app)
      .patch('/api/admin/comptes/abc/statut')
      .set('Authorization', auth('administrateur'))
      .send({ statut: 'suspendu' });

    expect(res.status).toBe(400);
    expect(prisma.utilisateur.findUnique).not.toHaveBeenCalled();
  });

  it('refuse un statut inconnu (400)', async () => {
    const res = await request(app)
      .patch('/api/admin/comptes/5/statut')
      .set('Authorization', auth('administrateur'))
      .send({ statut: 'banni' });

    expect(res.status).toBe(400);
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });

  it('suspend le compte avec sa raison (200)', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 5, role: 'spectateur' });
    prisma.utilisateur.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));

    const res = await request(app)
      .patch('/api/admin/comptes/5/statut')
      .set('Authorization', auth('administrateur'))
      .send({ statut: 'suspendu', raison: 'Abus signalé' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 5, statut: 'suspendu', raisonSuspension: 'Abus signalé' });
  });

  it('refuse de suspendre un administrateur (403)', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 1, role: 'administrateur' });

    const res = await request(app)
      .patch('/api/admin/comptes/1/statut')
      .set('Authorization', auth('administrateur'))
      .send({ statut: 'suspendu' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Un compte administrateur ne peut pas être suspendu.');
  });
});

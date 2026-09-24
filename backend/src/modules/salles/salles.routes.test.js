jest.mock('../../lib/prisma');

const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');

function corpsValide(overrides = {}) {
  return {
    organisateurId: 1,
    nom: 'Salle du Cégep',
    nombreRangees: 2,
    siegesParRangee: 3,
    ...overrides,
  };
}

describe('GET /api/salles', () => {
  it('renvoie la liste des salles', async () => {
    const liste = [{ id: 19, nom: 'Salle A', sieges: [] }];
    prisma.salle.findMany.mockResolvedValue(liste);

    const res = await request(app).get('/api/salles');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: liste });
  });
});

describe('POST /api/salles', () => {
  it('refuse un corps invalide sans toucher à la base (400)', async () => {
    const res = await request(app).post('/api/salles').send(corpsValide({ nombreRangees: 0 }));

    expect(res.status).toBe(400);
    expect(prisma.salle.create).not.toHaveBeenCalled();
  });

  it('crée la salle et génère un siège par case de la grille (201)', async () => {
    prisma.salle.create.mockResolvedValue({ id: 1, organisateurId: 1, nom: 'Salle du Cégep' });
    prisma.siege.createMany.mockResolvedValue({ count: 6 });
    const salleAvecSieges = { id: 1, nom: 'Salle du Cégep', sieges: new Array(6).fill({}) };
    prisma.salle.findUnique.mockResolvedValue(salleAvecSieges);

    const res = await request(app).post('/api/salles').send(corpsValide());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: salleAvecSieges });

    // 2 rangées x 3 sièges par rangée = 6 sièges, numérotés à partir de 1
    const siegesGeneres = prisma.siege.createMany.mock.calls[0][0].data;
    expect(siegesGeneres).toHaveLength(6);
    expect(siegesGeneres).toEqual(
      expect.arrayContaining([
        { salleId: 1, numeroRangee: 1, numeroColonne: 1 },
        { salleId: 1, numeroRangee: 2, numeroColonne: 3 },
      ]),
    );
  });

  it('traduit un doublon (organisateur + nom) en 409', async () => {
    prisma.salle.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));

    const res = await request(app).post('/api/salles').send(corpsValide());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/déjà une salle/);
  });
});

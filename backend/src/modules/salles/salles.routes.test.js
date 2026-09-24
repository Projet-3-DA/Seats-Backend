const { test } = require('node:test');
const assert = require('node:assert/strict');
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

test('GET /api/salles renvoie la liste des salles', async (t) => {
  const liste = [{ id: 19, nom: 'Salle A', sieges: [] }];
  prisma.salle.findMany = t.mock.fn(async () => liste);

  const res = await request(app).get('/api/salles');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, data: liste });
});

test('POST /api/salles refuse un corps invalide sans toucher à la base (400)', async (t) => {
  const creation = prisma.salle.create = t.mock.fn(async () => {
    throw new Error('ne devrait pas être appelé');
  });

  const res = await request(app).post('/api/salles').send(corpsValide({ nombreRangees: 0 }));

  assert.equal(res.status, 400);
  assert.equal(creation.mock.callCount(), 0);
});

test('POST /api/salles crée la salle et génère un siège par case de la grille (201)', async (t) => {
  prisma.$transaction = t.mock.fn((callback) => callback(prisma));
  prisma.salle.create = t.mock.fn(async () => ({ id: 1, organisateurId: 1, nom: 'Salle du Cégep' }));
  const creationSieges = prisma.siege.createMany = t.mock.fn(async () => ({ count: 6 }));
  const salleAvecSieges = { id: 1, nom: 'Salle du Cégep', sieges: new Array(6).fill({}) };
  prisma.salle.findUnique = t.mock.fn(async () => salleAvecSieges);

  const res = await request(app).post('/api/salles').send(corpsValide());

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { success: true, data: salleAvecSieges });

  // 2 rangées x 3 sièges par rangée = 6 sièges, numérotés à partir de 1
  const siegesGeneres = creationSieges.mock.calls[0].arguments[0].data;
  assert.equal(siegesGeneres.length, 6);
  assert.deepEqual(siegesGeneres[0], { salleId: 1, numeroRangee: 1, numeroColonne: 1 });
  assert.deepEqual(siegesGeneres[5], { salleId: 1, numeroRangee: 2, numeroColonne: 3 });
});

test('POST /api/salles traduit un doublon (organisateur + nom) en 409', async (t) => {
  prisma.$transaction = t.mock.fn((callback) => callback(prisma));
  prisma.salle.create = t.mock.fn(async () => {
    throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
  });

  const res = await request(app).post('/api/salles').send(corpsValide());

  assert.equal(res.status, 409);
  assert.match(res.body.error, /déjà une salle/);
});

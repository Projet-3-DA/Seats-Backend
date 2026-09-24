const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { getAllSalles, createSalle } = require('./salles.service');

// "rejette une salle sans aucun siège" est déjà couvert dans salles.validation.test.js
// (nombreRangees/siegesParRangee > 0), avant que le service soit appelé.
test.todo("l'unicité (organisateurId, nom) est une contrainte DB (@@unique) : pas testable avec Prisma simulé (#2)");
test.todo("getAllSalles() ne retourne que les salles de l'organisateur courant (#25)");
test.todo("updateSalle() modifie une salle tant qu'aucun événement ne l'utilise (#10)");
test.todo("updateSalle() refuse la modification si la salle est déjà utilisée par un événement (#10)");
test.todo('assignerSection() assigne un groupe de sièges à une section nommée avec un prix (#11)');

// Les modèles Prisma (prisma.salle, prisma.siege…) sont des Proxy : leurs descripteurs de propriété
// renvoient toujours `value: undefined`, ce qui casse t.mock.method(). On remplace donc la méthode par
// simple affectation (t.mock.fn() donne le même suivi des appels, .mock.calls etc.).

test('getAllSalles() liste les salles avec leurs sièges', async (t) => {
  const rows = [{ id: 1, nom: 'Salle A', sieges: [] }];
  prisma.salle.findMany = t.mock.fn(async (args) => {
    assert.deepEqual(args, { include: { sieges: true } });
    return rows;
  });

  assert.deepEqual(await getAllSalles(), rows);
});

test('createSalle() crée la salle et génère individuellement chaque siège (rangée + colonne)', async (t) => {
  const data = { organisateurId: 1, nom: 'Salle A', nombreRangees: 2, siegesParRangee: 3 };
  prisma.$transaction = t.mock.fn((callback) => callback(prisma));
  prisma.salle.create = t.mock.fn(async (args) => {
    assert.deepEqual(args, { data });
    return { id: 1, ...data };
  });
  const creationSieges = prisma.siege.createMany = t.mock.fn(async () => ({ count: 6 }));
  const salleAvecSieges = { id: 1, ...data, sieges: new Array(6).fill({}) };
  prisma.salle.findUnique = t.mock.fn(async (args) => {
    assert.deepEqual(args, { where: { id: 1 }, include: { sieges: true } });
    return salleAvecSieges;
  });

  assert.deepEqual(await createSalle(data), salleAvecSieges);

  // 2 rangées x 3 sièges par rangée = 6 sièges, numérotés à partir de 1
  const sieges = creationSieges.mock.calls[0].arguments[0].data;
  assert.equal(sieges.length, 6);
  assert.deepEqual(sieges[0], { salleId: 1, numeroRangee: 1, numeroColonne: 1 });
  assert.deepEqual(sieges[5], { salleId: 1, numeroRangee: 2, numeroColonne: 3 });
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { getAllSalles, createSalle } = require('./salles.service');

// À écrire une fois la logique implémentée (salles.service.js a encore des TODO) :
test.todo('createSalle() rejette une salle sans aucun siège (#2)');
test.todo('createSalle() génère individuellement chaque siège (rangée + numéro) (#24)');
test.todo("createSalle() respecte l'unicité (organisateurId, nom) (#2)");
test.todo("getAllSalles() ne retourne que les salles de l'organisateur courant (#25)");
test.todo("updateSalle() modifie une salle tant qu'aucun événement ne l'utilise (#10)");
test.todo("updateSalle() refuse la modification si la salle est déjà utilisée par un événement (#10)");
test.todo('assignerSection() assigne un groupe de sièges à une section nommée avec un prix (#11)');

test('getAllSalles() liste les salles avec leurs sièges', async (t) => {
  const rows = [{ id: 1, nom: 'Salle A', sieges: [] }];
  prisma.salle.findMany = t.mock.fn(async (args) => {
    assert.deepEqual(args, { include: { sieges: true } });
    return rows;
  });

  assert.deepEqual(await getAllSalles(), rows);
});

test('createSalle() crée une salle avec les données fournies', async (t) => {
  const data = { nom: 'Salle A', organisateurId: 1, nombreRangees: 10, siegesParRangee: 20 };
  const created = { id: 1, ...data };
  prisma.salle.create = t.mock.fn(async (args) => {
    assert.deepEqual(args, { data });
    return created;
  });

  assert.deepEqual(await createSalle(data), created);
});

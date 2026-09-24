const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { getAllEvenements, createEvenement } = require('./evenements.service');

// À écrire une fois la logique implémentée (evenements.service.js a encore des TODO) :
test.todo('createEvenement() refuse une date passée, avec un message explicite (#3)');
test.todo('createEvenement() refuse la publication sans salle attribuée (#29)');
test.todo("getAllEvenements() ne retourne que les événements dont la date n'est pas passée (#4)");
test.todo('getAllEvenements() peut être filtré par date ou par lieu, filtres combinables (#21)');
test.todo('getAllEvenements() peut être dupliqué pour créer rapidement une nouvelle séance (#23)');

test('getAllEvenements() liste les evenements avec leur salle', async (t) => {
  const rows = [{ id: 1, titre: 'Concert', salle: { id: 1, nom: 'Salle A' } }];
  prisma.evenement.findMany = t.mock.fn(async (args) => {
    assert.deepEqual(args, { include: { salle: true } });
    return rows;
  });

  assert.deepEqual(await getAllEvenements(), rows);
});

test('createEvenement() crée un evenement avec les données fournies', async (t) => {
  const data = { titre: 'Concert', salleId: 1, organisateurId: 1, dateHeure: new Date() };
  const created = { id: 1, ...data };
  prisma.evenement.create = t.mock.fn(async (args) => {
    assert.deepEqual(args, { data });
    return created;
  });

  assert.deepEqual(await createEvenement(data), created);
});

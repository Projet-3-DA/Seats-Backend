const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { getAllEvenements, createEvenement } = require('./evenements.service');

// "refuse une date passée" et "refuse la publication sans salle attribuée" sont maintenant couverts,
// mais dans evenements.validation.test.js (c'est validateCreateEvenement qui s'en charge, avant que
// le service soit appelé) — pas de nouveau test.todo ici pour éviter la confusion sur la couche.
test.todo("getAllEvenements() ne retourne que les événements dont la date n'est pas passée (#4)");
test.todo('getAllEvenements() peut être filtré par date ou par lieu, filtres combinables (#21)');
test.todo('getAllEvenements() peut être dupliqué pour créer rapidement une nouvelle séance (#23)');

// Les modèles Prisma (prisma.salle, prisma.evenement…) sont des Proxy : leurs descripteurs de
// propriété renvoient toujours `value: undefined`, ce qui casse t.mock.method(). On remplace donc la
// méthode par simple affectation (t.mock.fn() donne le même suivi des appels, .mock.calls etc.).

test('getAllEvenements() liste les evenements avec leur salle', async (t) => {
  const rows = [{ id: 1, titre: 'Concert', salle: { id: 1, nom: 'Salle A' } }];
  prisma.evenement.findMany = t.mock.fn(async (args) => {
    assert.deepEqual(args, { include: { salle: true } });
    return rows;
  });

  assert.deepEqual(await getAllEvenements(), rows);
});

test('createEvenement() crée un evenement quand la salle existe et appartient à l\'organisateur', async (t) => {
  // description/afficheUrl explicitement undefined : createEvenement() les déstructure et les
  // retransmet tels quels à Prisma, même absents du corps ; à distinguer de "absents de l'objet"
  // pour assert.deepEqual (contrairement à Jest, Node ne les traite pas comme équivalents).
  const data = {
    organisateurId: 1,
    salleId: 19,
    titre: 'Concert',
    description: undefined,
    dateHeure: new Date(),
    afficheUrl: undefined,
    tarif: 25,
  };
  const created = { id: 1, ...data };
  prisma.salle.findUnique = t.mock.fn(async (args) => {
    assert.deepEqual(args, { where: { id: 19 } });
    return { id: 19, organisateurId: 1 };
  });
  const creation = prisma.evenement.create = t.mock.fn(async () => created);

  assert.deepEqual(await createEvenement(data), created);
  assert.deepEqual(creation.mock.calls[0].arguments[0], { data, include: { salle: true } });
});

test("createEvenement() refuse (404) si la salle n'existe pas", async (t) => {
  const data = { organisateurId: 1, salleId: 999, titre: 'Concert', dateHeure: new Date(), tarif: 25 };
  prisma.salle.findUnique = t.mock.fn(async () => null);
  const creation = prisma.evenement.create = t.mock.fn(async () => {
    throw new Error('ne devrait pas être appelé');
  });

  await assert.rejects(() => createEvenement(data), (err) => err.status === 404);
  assert.equal(creation.mock.callCount(), 0);
});

test('createEvenement() refuse (403) si la salle appartient à un autre organisateur', async (t) => {
  const data = { organisateurId: 1, salleId: 19, titre: 'Concert', dateHeure: new Date(), tarif: 25 };
  prisma.salle.findUnique = t.mock.fn(async () => ({ id: 19, organisateurId: 2 }));

  await assert.rejects(() => createEvenement(data), (err) => err.status === 403);
});

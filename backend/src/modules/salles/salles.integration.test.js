// Test d'intégration contre un VRAI Postgres (voir reservations.integration.test.js) : sections
// tarifaires d'une salle (#11), clés étrangères et transaction réelles.
//
// Exclu de `npm test` : lancé avec `npm run test:integration`, une fois une vraie base disponible.

const prisma = require('../../lib/prisma');
const { createSalle, remplacerSections, updateSalle } = require('./salles.service');
const { getPlanSalle } = require('../evenements/evenements.service');

const SUFFIXE = Date.now();

let organisateur;
let salle;

beforeAll(async () => {
  organisateur = await prisma.utilisateur.create({
    data: { email: `orga-sections-${SUFFIXE}@test.local`, motDePasse: 'x', nom: 'Test', prenom: 'Orga', role: 'organisateur' },
  });
});

beforeEach(async () => {
  salle = await createSalle({ organisateurId: organisateur.id, nom: `Salle sections ${SUFFIXE}-${Math.random()}`, nombreRangees: 2, siegesParRangee: 3 });
});

afterEach(async () => {
  await prisma.reservation.deleteMany({ where: { evenement: { salleId: salle.id } } });
  await prisma.evenement.deleteMany({ where: { salleId: salle.id } });
  await prisma.siege.deleteMany({ where: { salleId: salle.id } });
  await prisma.section.deleteMany({ where: { salleId: salle.id } });
  await prisma.salle.delete({ where: { id: salle.id } });
});

afterAll(async () => {
  if (organisateur) await prisma.utilisateur.delete({ where: { id: organisateur.id } });
  await prisma.$disconnect();
});

const rangee = (n) => salle.sieges.filter((s) => s.numeroRangee === n).map((s) => s.id);

test('assigne chaque groupe de sièges à sa section, les autres restent sans section', async () => {
  const [a1, a2] = rangee(1);

  const resultat = await remplacerSections(salle.id, {
    organisateurId: organisateur.id,
    sections: [{ nom: 'Parterre', prix: 45, couleur: '#2563eb', siegeIds: [a1, a2] }],
  });

  expect(resultat.sections).toEqual([expect.objectContaining({ nom: 'Parterre', prix: 45, couleur: '#2563eb' })]);
  const sectionId = resultat.sections[0].id;
  const parSiege = Object.fromEntries(resultat.sieges.map((s) => [s.id, s.sectionId]));
  expect(parSiege[a1]).toBe(sectionId);
  expect(parSiege[a2]).toBe(sectionId);
  expect(resultat.sieges.filter((s) => s.sectionId === null)).toHaveLength(4);
});

test('remplacer les sections retire les anciennes et réassigne les sièges', async () => {
  await remplacerSections(salle.id, {
    organisateurId: organisateur.id,
    sections: [{ nom: 'Parterre', prix: 45, couleur: '#2563eb', siegeIds: rangee(1) }],
  });

  const resultat = await remplacerSections(salle.id, {
    organisateurId: organisateur.id,
    sections: [{ nom: 'Balcon', prix: 20, couleur: '#f59e0b', siegeIds: rangee(2) }],
  });

  expect(resultat.sections.map((s) => s.nom)).toEqual(['Balcon']);
  expect(await prisma.section.count({ where: { salleId: salle.id } })).toBe(1);
  const balconId = resultat.sections[0].id;
  expect(resultat.sieges.filter((s) => s.sectionId === balconId).map((s) => s.id).sort()).toEqual(rangee(2).sort());
  expect(resultat.sieges.filter((s) => rangee(1).includes(s.id)).every((s) => s.sectionId === null)).toBe(true);
});

test("le plan d'un événement donne le prix de la section, ou le tarif de l'événement hors section", async () => {
  const resultat = await remplacerSections(salle.id, {
    organisateurId: organisateur.id,
    sections: [{ nom: 'Balcon', prix: 40, couleur: '#f59e0b', siegeIds: rangee(2) }],
  });
  const evenement = await prisma.evenement.create({
    data: { organisateurId: organisateur.id, salleId: salle.id, titre: 'Test', dateHeure: new Date(Date.now() + 86400_000), tarif: 25 },
  });

  const plan = await getPlanSalle(evenement.id);

  expect(plan.sections).toEqual([{ id: resultat.sections[0].id, nom: 'Balcon', prix: 40, couleur: '#f59e0b' }]);
  for (const siege of plan.sieges) {
    expect(siege.prix).toBe(siege.rangee === 2 ? 40 : 25);
  }
});

test('les sections ne sont plus modifiables une fois la salle utilisée par un événement', async () => {
  await prisma.evenement.create({
    data: { organisateurId: organisateur.id, salleId: salle.id, titre: 'Test', dateHeure: new Date(Date.now() + 86400_000), tarif: 25 },
  });

  await expect(
    remplacerSections(salle.id, {
      organisateurId: organisateur.id,
      sections: [{ nom: 'Balcon', prix: 40, couleur: '#f59e0b', siegeIds: rangee(2) }],
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await prisma.section.count({ where: { salleId: salle.id } })).toBe(0);
});

test('modifier la disposition (#10) après avoir créé des sections ne casse rien', async () => {
  await remplacerSections(salle.id, {
    organisateurId: organisateur.id,
    sections: [{ nom: 'Balcon', prix: 40, couleur: '#f59e0b', siegeIds: rangee(2) }],
  });

  const modifiee = await updateSalle(salle.id, { organisateurId: organisateur.id, nom: salle.nom, nombreRangees: 3, siegesParRangee: 2 });

  // Les sièges sont regénérés : ils repartent sans section, la section reste à réassigner.
  expect(modifiee.sieges).toHaveLength(6);
  expect(modifiee.sieges.every((s) => s.sectionId === null)).toBe(true);
});

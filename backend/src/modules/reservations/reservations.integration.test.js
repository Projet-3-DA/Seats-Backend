// Test d'intégration contre un VRAI Postgres (pas de mock ici) : contrairement au reste de la suite,
// celui-ci a besoin d'une vraie base migrée, accessible via DATABASE_URL. Objectif : prouver que la
// contrainte @@unique([siegeId, evenementId]) tient réellement sous une confirmation concurrente,
// pour une réservation d'un seul siège comme de plusieurs à la fois (#6, #16, #27, #38) — un mock ne
// peut pas simuler un verrouillage de ligne réel.
//
// Exclu de `npm test` (voir testPathIgnorePatterns dans package.json) : lancé séparément avec
// `npm run test:integration`, une fois une vraie base disponible (voir docker-compose.yml à la racine
// du dépôt, ou le job "test-integration" de la CI).

const prisma = require('../../lib/prisma');
const { reserverSieges } = require('./reservations.service');

const SUFFIXE = Date.now(); // évite les collisions d'email/nom si la base n'est pas parfaitement vide

let organisateur;
let spectateur;
let salle;
let sieges; // [siege1, siege2, siege3]
let evenement;

beforeAll(async () => {
  organisateur = await prisma.utilisateur.create({
    data: {
      email: `organisateur-${SUFFIXE}@test.local`,
      motDePasse: 'x',
      nom: 'Test',
      prenom: 'Organisateur',
      role: 'organisateur',
    },
  });
  spectateur = await prisma.utilisateur.create({
    data: {
      email: `spectateur-${SUFFIXE}@test.local`,
      motDePasse: 'x',
      nom: 'Test',
      prenom: 'Spectateur',
      role: 'spectateur',
    },
  });
  salle = await prisma.salle.create({
    data: { organisateurId: organisateur.id, nom: `Salle test ${SUFFIXE}`, nombreRangees: 1, siegesParRangee: 3 },
  });
  sieges = await Promise.all(
    [1, 2, 3].map((numeroColonne) =>
      prisma.siege.create({ data: { salleId: salle.id, numeroRangee: 1, numeroColonne } }),
    ),
  );
  evenement = await prisma.evenement.create({
    data: {
      organisateurId: organisateur.id,
      salleId: salle.id,
      titre: `Évènement test ${SUFFIXE}`,
      dateHeure: new Date(Date.now() + 7 * 86400_000),
      tarif: 10,
    },
  });
});

afterAll(async () => {
  // Sans casse même si le test a échoué avant d'avoir tout créé.
  await prisma.reservation.deleteMany({ where: { evenementId: evenement?.id } });
  if (evenement) await prisma.evenement.delete({ where: { id: evenement.id } });
  await prisma.siege.deleteMany({ where: { salleId: salle?.id } });
  if (salle) await prisma.salle.delete({ where: { id: salle.id } });
  if (spectateur) await prisma.utilisateur.delete({ where: { id: spectateur.id } });
  if (organisateur) await prisma.utilisateur.delete({ where: { id: organisateur.id } });
  await prisma.$disconnect();
});

afterEach(async () => {
  // Chaque test réserve un jeu de sièges différent, mais on nettoie quand même par précaution.
  await prisma.reservation.deleteMany({ where: { evenementId: evenement.id } });
});

test('réserve plusieurs sièges libres en une seule fois', async () => {
  const [siege1, siege2] = sieges;

  const reservations = await reserverSieges({
    spectateurId: spectateur.id,
    evenementId: evenement.id,
    siegeIds: [siege1.id, siege2.id],
  });

  expect(reservations).toHaveLength(2);
  const enBase = await prisma.reservation.findMany({ where: { evenementId: evenement.id } });
  expect(enBase).toHaveLength(2);
  expect(enBase.map((r) => r.siegeId).sort()).toEqual([siege1.id, siege2.id].sort());
});

test('une seule des deux confirmations concurrentes sur le même siège réussit (contrainte DB)', async () => {
  const [siege1] = sieges;
  const demande = { spectateurId: spectateur.id, evenementId: evenement.id, siegeIds: [siege1.id] };

  const resultats = await Promise.allSettled([reserverSieges(demande), reserverSieges(demande)]);

  const reussies = resultats.filter((r) => r.status === 'fulfilled');
  const echouees = resultats.filter((r) => r.status === 'rejected');
  expect(reussies).toHaveLength(1);
  expect(echouees).toHaveLength(1);
  expect(echouees[0].reason.status).toBe(409);

  const enBase = await prisma.reservation.findMany({ where: { evenementId: evenement.id, siegeId: siege1.id } });
  expect(enBase).toHaveLength(1);
});

test('une réservation multi-sièges concurrente est tout ou rien : jamais de doublon ni de doublon partiel', async () => {
  const [siege1, siege2] = sieges;
  const demande = {
    spectateurId: spectateur.id,
    evenementId: evenement.id,
    siegeIds: [siege1.id, siege2.id],
  };

  const resultats = await Promise.allSettled([reserverSieges(demande), reserverSieges(demande)]);

  const reussies = resultats.filter((r) => r.status === 'fulfilled');
  expect(reussies).toHaveLength(1);

  // Exactement les 2 sièges demandés sont réservés, jamais 4 (les deux tentatives) ni 1 (une transaction
  // à moitié appliquée) : la transaction Prisma annule tout dès qu'une des créations échoue.
  const enBase = await prisma.reservation.findMany({ where: { evenementId: evenement.id } });
  expect(enBase).toHaveLength(2);
});

// #27 : la garantie doit vivre dans la base elle-même, pas dans la logique applicative. On le prouve en
// contournant complètement reserverSieges() et en tirant deux INSERT bruts en parallèle : même sans
// aucune vérification côté service, la contrainte @@unique([siegeId, evenementId]) fait le travail seule.
test('la contrainte unique protège même deux INSERT Prisma bruts, sans passer par reserverSieges()', async () => {
  const [, , siege3] = sieges;
  const donneesBrutes = {
    spectateurId: spectateur.id,
    siegeId: siege3.id,
    evenementId: evenement.id,
    statut: 'confirmee',
    delaiExpiration: new Date(Date.now() + 15 * 60_000),
  };

  const resultats = await Promise.allSettled([
    prisma.reservation.create({ data: donneesBrutes }),
    prisma.reservation.create({ data: donneesBrutes }),
  ]);

  const reussies = resultats.filter((r) => r.status === 'fulfilled');
  const echouees = resultats.filter((r) => r.status === 'rejected');
  expect(reussies).toHaveLength(1);
  expect(echouees).toHaveLength(1);
  expect(echouees[0].reason.code).toBe('P2002');

  const enBase = await prisma.reservation.findMany({ where: { siegeId: siege3.id, evenementId: evenement.id } });
  expect(enBase).toHaveLength(1);
});

// #27 : « même en cas de requêtes simultanées » — pas juste deux, on vérifie que la garantie tient
// aussi quand un lot de requêtes arrive en même temps sur le même siège.
test('sur 10 tentatives simultanées pour le même siège, une seule aboutit', async () => {
  const [siege1] = sieges;
  const demande = { spectateurId: spectateur.id, evenementId: evenement.id, siegeIds: [siege1.id] };

  const resultats = await Promise.allSettled(Array.from({ length: 10 }, () => reserverSieges(demande)));

  const reussies = resultats.filter((r) => r.status === 'fulfilled');
  const echouees = resultats.filter((r) => r.status === 'rejected');
  expect(reussies).toHaveLength(1);
  expect(echouees).toHaveLength(9);
  echouees.forEach((r) => expect(r.reason.status).toBe(409));

  const enBase = await prisma.reservation.findMany({ where: { siegeId: siege1.id, evenementId: evenement.id } });
  expect(enBase).toHaveLength(1);
});

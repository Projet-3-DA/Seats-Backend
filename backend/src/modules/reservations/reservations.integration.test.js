// Test d'intégration contre un VRAI Postgres (pas de mock ici) : contrairement au reste de la suite,
// celui-ci a besoin d'une vraie base migrée, accessible via DATABASE_URL. Objectif : prouver que la
// contrainte @@unique([siegeId, evenementId]) tient réellement sous une confirmation concurrente
// (#16, #27, #38) — un mock ne peut pas simuler un verrouillage de ligne réel.
//
// Exclu de `npm test` (voir testPathIgnorePatterns dans package.json) : lancé séparément avec
// `npm run test:integration`, une fois une vraie base disponible (voir docs/local-postgres dans le
// message de commit, ou le job "test-integration" de la CI).

const prisma = require('../../lib/prisma');
const { createReservation } = require('./reservations.service');

const SUFFIXE = Date.now(); // évite les collisions d'email/nom si la base n'est pas parfaitement vide

let organisateur;
let spectateur;
let salle;
let siege;
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
    data: { organisateurId: organisateur.id, nom: `Salle test ${SUFFIXE}`, nombreRangees: 1, siegesParRangee: 1 },
  });
  siege = await prisma.siege.create({
    data: { salleId: salle.id, numeroRangee: 1, numeroColonne: 1 },
  });
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
  if (siege) await prisma.siege.delete({ where: { id: siege.id } });
  if (salle) await prisma.salle.delete({ where: { id: salle.id } });
  if (spectateur) await prisma.utilisateur.delete({ where: { id: spectateur.id } });
  if (organisateur) await prisma.utilisateur.delete({ where: { id: organisateur.id } });
  await prisma.$disconnect();
});

test('une seule des deux confirmations concurrentes sur le même siège réussit (contrainte DB)', async () => {
  const donneesReservation = {
    spectateurId: spectateur.id,
    siegeId: siege.id,
    evenementId: evenement.id,
    statut: 'confirmee',
    delaiExpiration: new Date(Date.now() + 15 * 60_000),
  };

  const resultats = await Promise.allSettled([
    createReservation(donneesReservation),
    createReservation(donneesReservation),
  ]);

  const reussies = resultats.filter((r) => r.status === 'fulfilled');
  const echouees = resultats.filter((r) => r.status === 'rejected');

  expect(reussies).toHaveLength(1);
  expect(echouees).toHaveLength(1);
  expect(echouees[0].reason.code).toBe('P2002'); // violation de contrainte unique, pas une autre erreur

  // La base reflète bien une seule réservation pour ce siège+évènement, pas deux ni zéro.
  const enBase = await prisma.reservation.findMany({ where: { siegeId: siege.id, evenementId: evenement.id } });
  expect(enBase).toHaveLength(1);
});

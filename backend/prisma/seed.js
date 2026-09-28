// Données de démonstration créées au démarrage du conteneur : comptes (un par rôle), salles, événements
// et quelques réservations. Idempotent : ce qui existe déjà est laissé tel quel, donc un redémarrage ne
// réinitialise ni les données ni les mots de passe.
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const SALT_ROUNDS = 10;
const MOT_DE_PASSE_DEMO = 'Demo1234!';

const COMPTES_DEMO = [
  { email: 'spectateur@seats.demo', prenom: 'Sam', nom: 'Spectateur', role: 'spectateur' },
  { email: 'spectateur2@seats.demo', prenom: 'Camille', nom: 'Spectatrice', role: 'spectateur' },
  { email: 'organisateur@seats.demo', prenom: 'Olivia', nom: 'Organisatrice', role: 'organisateur' },
  { email: 'admin@seats.demo', prenom: 'Alex', nom: 'Admin', role: 'administrateur' },
];

const SALLES_DEMO = [
  { nom: 'Grande salle', nombreRangees: 5, siegesParRangee: 10 },
  { nom: 'Petit studio', nombreRangees: 3, siegesParRangee: 6 },
];

// `affiche` : graine d'une image de démonstration (picsum.photos) ; null = aucune affiche.
const EVENEMENTS_DEMO = [
  { titre: 'Festival de jazz', salle: 'Grande salle', dansJours: 7, heure: 20, tarif: 25, affiche: 'jazz' },
  { titre: 'Concert de rock', salle: 'Grande salle', dansJours: 14, heure: 21, tarif: 35, affiche: 'rock' },
  { titre: 'Pièce de théâtre', salle: 'Petit studio', dansJours: 10, heure: 19, tarif: 18.5, affiche: 'theatre' },
  { titre: 'Soirée cinéma en plein air', salle: 'Grande salle', dansJours: 21, heure: 20, tarif: 0, affiche: null },
  { titre: "Spectacle d'humour", salle: 'Petit studio', dansJours: 30, heure: 20, tarif: 22, affiche: 'humour' },
];

async function creerComptesDemo() {
  const motDePasse = await bcrypt.hash(MOT_DE_PASSE_DEMO, SALT_ROUNDS);
  const comptes = {};
  for (const compte of COMPTES_DEMO) {
    comptes[compte.email] = await prisma.utilisateur.upsert({
      where: { email: compte.email },
      update: {},
      create: { ...compte, motDePasse },
    });
  }
  return comptes;
}

async function creerSallesDemo(organisateur) {
  const salles = {};
  for (const { nom, nombreRangees, siegesParRangee } of SALLES_DEMO) {
    const salle = await prisma.salle.upsert({
      where: { organisateurId_nom: { organisateurId: organisateur.id, nom } },
      update: {},
      create: { organisateurId: organisateur.id, nom, nombreRangees, siegesParRangee },
    });
    const sieges = [];
    for (let numeroRangee = 1; numeroRangee <= nombreRangees; numeroRangee += 1) {
      for (let numeroColonne = 1; numeroColonne <= siegesParRangee; numeroColonne += 1) {
        sieges.push({ salleId: salle.id, numeroRangee, numeroColonne });
      }
    }
    await prisma.siege.createMany({ data: sieges, skipDuplicates: true });
    salles[nom] = salle;
  }
  return salles;
}

async function creerEvenementsDemo(organisateur, salles) {
  const evenements = {};
  for (const { titre, salle, dansJours, heure, tarif, affiche } of EVENEMENTS_DEMO) {
    let evenement = await prisma.evenement.findFirst({ where: { organisateurId: organisateur.id, titre } });
    if (!evenement) {
      const dateHeure = new Date();
      dateHeure.setDate(dateHeure.getDate() + dansJours);
      dateHeure.setHours(heure, 0, 0, 0);
      evenement = await prisma.evenement.create({
        data: {
          organisateurId: organisateur.id,
          salleId: salles[salle].id,
          titre,
          description: 'Événement de démonstration',
          afficheUrl: affiche ? `https://picsum.photos/seed/${affiche}/400/600` : null,
          dateHeure,
          tarif,
        },
      });
    }
    evenements[titre] = evenement;
  }
  return evenements;
}

// Réserve `nombre` sièges consécutifs à partir du siège `debut` (rangée par rangée) pour un spectateur.
async function reserverSiegesDemo({ spectateur, evenement, debut, nombre }) {
  const sieges = await prisma.siege.findMany({
    where: { salleId: evenement.salleId },
    orderBy: [{ numeroRangee: 'asc' }, { numeroColonne: 'asc' }],
  });
  const maintenant = new Date();
  await prisma.reservation.createMany({
    data: sieges.slice(debut, debut + nombre).map((siege) => ({
      spectateurId: spectateur.id,
      siegeId: siege.id,
      evenementId: evenement.id,
      statut: 'confirmee',
      dateConfirmation: maintenant,
      delaiExpiration: maintenant,
    })),
    skipDuplicates: true,
  });
}

async function creerDonneesDemo() {
  const comptes = await creerComptesDemo();
  const organisateur = comptes['organisateur@seats.demo'];
  const salles = await creerSallesDemo(organisateur);
  const evenements = await creerEvenementsDemo(organisateur, salles);

  const jazz = evenements['Festival de jazz'];
  const theatre = evenements['Pièce de théâtre'];
  await reserverSiegesDemo({ spectateur: comptes['spectateur2@seats.demo'], evenement: jazz, debut: 3, nombre: 5 });
  await reserverSiegesDemo({ spectateur: comptes['spectateur@seats.demo'], evenement: jazz, debut: 14, nombre: 2 });
  await reserverSiegesDemo({ spectateur: comptes['spectateur@seats.demo'], evenement: theatre, debut: 7, nombre: 2 });
}

module.exports = { COMPTES_DEMO, SALLES_DEMO, EVENEMENTS_DEMO, MOT_DE_PASSE_DEMO, creerComptesDemo, creerDonneesDemo };

if (require.main === module) {
  creerDonneesDemo()
    .then(() => {
      console.log(`Données de démonstration prêtes. Comptes : ${COMPTES_DEMO.map((c) => c.email).join(', ')}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Échec de la création des données de démonstration :', error);
      process.exit(1);
    });
}

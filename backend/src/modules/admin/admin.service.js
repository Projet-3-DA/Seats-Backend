const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');
const { chargerEvenementAvecVentes, calculerVentes } = require('../evenements/evenements.service');

const ORGANISATEUR = { select: { id: true, prenom: true, nom: true, email: true } };

// Supervision (#36) : tous les événements de la plateforme, passés compris, quel que soit l'organisateur.
// Les événements à venir d'abord (du plus proche au plus lointain), puis les passés (du plus récent au
// plus ancien).
async function getEvenements() {
  const evenements = await prisma.evenement.findMany({
    orderBy: { dateHeure: 'asc' },
    include: {
      salle: { select: { id: true, nom: true, _count: { select: { sieges: true } } } },
      organisateur: ORGANISATEUR,
      _count: { select: { reservations: { where: { statut: 'confirmee' } } } },
    },
  });

  const maintenant = new Date();
  return aVenirPuisPasses(
    evenements.map(({ _count, salle, ...evenement }) => ({
      ...evenement,
      salle: { id: salle.id, nom: salle.nom },
      vendus: _count.reservations,
      totalSieges: salle._count.sieges,
      terminee: evenement.dateHeure <= maintenant,
    })),
  );
}

// `liste` est triée par date croissante : les événements à venir restent du plus proche au plus lointain,
// les passés sont remis du plus récent au plus ancien, après eux.
function aVenirPuisPasses(liste) {
  const aVenir = liste.filter((e) => !e.terminee);
  const passes = liste.filter((e) => e.terminee).reverse();
  return [...aVenir, ...passes];
}

const COMPTES_ORGANISATEUR = { _count: { select: { evenements: true, salles: true } } };

function formaterOrganisateur({ _count, ...organisateur }) {
  return { ...organisateur, nombreEvenements: _count.evenements, nombreSalles: _count.salles };
}

// Liste des organisateurs inscrits (#15) : nom, courriel et nombre d'événements de chacun,
// par ordre alphabétique. Le mot de passe n'est jamais sélectionné.
async function getOrganisateurs() {
  const organisateurs = await prisma.utilisateur.findMany({
    where: { role: 'organisateur' },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: { id: true, prenom: true, nom: true, email: true, createdAt: true, ...COMPTES_ORGANISATEUR },
  });
  return organisateurs.map(formaterOrganisateur);
}

// Détail d'un organisateur : ses salles et ses événements (à venir d'abord, puis passés).
async function getOrganisateur(organisateurId) {
  const organisateur = await prisma.utilisateur.findFirst({
    where: { id: organisateurId, role: 'organisateur' },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      createdAt: true,
      ...COMPTES_ORGANISATEUR,
      salles: { orderBy: { nom: 'asc' }, select: { id: true, nom: true, nombreRangees: true, siegesParRangee: true } },
      evenements: {
        orderBy: { dateHeure: 'asc' },
        select: { id: true, titre: true, dateHeure: true, salle: { select: { id: true, nom: true } } },
      },
    },
  });
  if (!organisateur) throw httpError(404, 'Organisateur introuvable.');

  const { salles, evenements, ...reste } = organisateur;
  const maintenant = new Date();
  return {
    ...formaterOrganisateur(reste),
    salles,
    evenements: aVenirPuisPasses(evenements.map((e) => ({ ...e, terminee: e.dateHeure <= maintenant }))),
  };
}

// Détail d'un événement pour l'administrateur : ses informations, son organisateur et ses ventes siège par
// siège (même calcul que le tableau de bord de l'organisateur, #13), sans vérifier à qui il appartient.
async function getEvenement(evenementId) {
  const evenement = await chargerEvenementAvecVentes(evenementId, { organisateur: ORGANISATEUR });
  const ventes = calculerVentes(evenement);
  return {
    ...ventes,
    evenement: {
      ...ventes.evenement,
      description: evenement.description,
      afficheUrl: evenement.afficheUrl,
      createdAt: evenement.createdAt,
      terminee: evenement.dateHeure <= new Date(),
    },
    organisateur: evenement.organisateur,
  };
}

const STATUTS_COMPTE = ['actif', 'suspendu'];
const RAISON_MAX = 500;
const CHAMPS_COMPTE = {
  id: true,
  prenom: true,
  nom: true,
  email: true,
  role: true,
  statut: true,
  raisonSuspension: true,
  suspenduLe: true,
  createdAt: true,
};

// Comptes que l'administrateur peut suspendre (#20) : organisateurs et spectateurs, par ordre alphabétique.
async function getComptes() {
  return prisma.utilisateur.findMany({
    where: { role: { in: ['organisateur', 'spectateur'] } },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: CHAMPS_COMPTE,
  });
}

// Suspend ou réactive un compte (#20). Le compte est conservé ; la raison, optionnelle, est enregistrée
// avec la date de suspension et effacée à la réactivation. Un compte administrateur ne peut pas être
// suspendu.
// Les comptes de démonstration (prisma/seed.js) ont un mot de passe public et sont exigés pour la
// correction : personne ne doit pouvoir les bloquer, sur le site en ligne notamment.
const DOMAINE_DEMO = '@seats.demo';

function estCompteDemo(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(DOMAINE_DEMO);
}

async function changerStatutCompte(compteId, { statut, raison } = {}) {
  if (!STATUTS_COMPTE.includes(statut)) {
    throw httpError(400, 'Le statut doit être « actif » ou « suspendu ».');
  }
  if (raison !== undefined && raison !== null && typeof raison !== 'string') {
    throw httpError(400, 'La raison doit être un texte.');
  }
  const raisonNettoyee = raison ? raison.trim() : '';
  if (raisonNettoyee.length > RAISON_MAX) {
    throw httpError(400, `La raison ne doit pas dépasser ${RAISON_MAX} caractères.`);
  }

  const compte = await prisma.utilisateur.findUnique({
    where: { id: compteId },
    select: { id: true, role: true, email: true },
  });
  if (!compte) throw httpError(404, 'Compte introuvable.');
  if (compte.role === 'administrateur') {
    throw httpError(403, 'Un compte administrateur ne peut pas être suspendu.');
  }
  // La réactivation reste permise : elle débloque un compte de démonstration suspendu avant cette règle.
  if (statut === 'suspendu' && estCompteDemo(compte.email)) {
    throw httpError(403, 'Un compte de démonstration ne peut pas être suspendu.');
  }

  const data =
    statut === 'suspendu'
      ? { statut, raisonSuspension: raisonNettoyee || null, suspenduLe: new Date() }
      : { statut, raisonSuspension: null, suspenduLe: null };
  return prisma.utilisateur.update({ where: { id: compteId }, data, select: CHAMPS_COMPTE });
}

module.exports = {
  getEvenements,
  getEvenement,
  getOrganisateurs,
  getOrganisateur,
  getComptes,
  changerStatutCompte,
  estCompteDemo,
};

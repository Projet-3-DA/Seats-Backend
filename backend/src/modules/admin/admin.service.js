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

// Liste des organisateurs inscrits (#19 du backlog) : nom, courriel et nombre d'événements de chacun,
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

module.exports = { getEvenements, getEvenement, getOrganisateurs, getOrganisateur };

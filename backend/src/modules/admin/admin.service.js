const prisma = require('../../lib/prisma');
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
  const liste = evenements.map(({ _count, salle, ...evenement }) => ({
    ...evenement,
    salle: { id: salle.id, nom: salle.nom },
    vendus: _count.reservations,
    totalSieges: salle._count.sieges,
    terminee: evenement.dateHeure <= maintenant,
  }));
  const aVenir = liste.filter((e) => !e.terminee);
  const passes = liste.filter((e) => e.terminee).reverse();
  return [...aVenir, ...passes];
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

module.exports = { getEvenements, getEvenement };

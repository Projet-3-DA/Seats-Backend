const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');

const DUREE_SELECTION_MS = 15 * 60_000; // durée pendant laquelle un siège "en_selection" reste bloqué (#15, #32)

async function getReservationsByUser(spectateurId) {
  return await prisma.reservation.findMany({
    where: { spectateurId },
    include: { evenement: true, siege: true },
  });
}

// Réserve un ou plusieurs sièges libres pour un événement (#6). Tout ou rien : soit tous les sièges
// demandés sont réservés, soit aucun ne l'est.
async function reserverSieges({ spectateurId, evenementId, siegeIds }) {
  const evenement = await prisma.evenement.findUnique({
    where: { id: evenementId },
    include: { salle: { include: { sieges: true } } },
  });
  if (!evenement) throw httpError(404, 'Cet événement n\'existe pas.');

  const siegesDeLaSalle = new Set(evenement.salle.sieges.map((s) => s.id));
  const siegesInconnus = siegeIds.filter((id) => !siegesDeLaSalle.has(id));
  if (siegesInconnus.length > 0) {
    throw httpError(400, `Ces sièges n'appartiennent pas à la salle de l'événement : ${siegesInconnus.join(', ')}.`);
  }

  // Un siège est indisponible s'il est confirmé, ou "en sélection" par quelqu'un dont le délai n'est
  // pas encore expiré (#26, #30, #31). Un siège expiré redevient libre sans tâche de nettoyage à part.
  const reservationsExistantes = await prisma.reservation.findMany({
    where: {
      evenementId,
      siegeId: { in: siegeIds },
      OR: [{ statut: 'confirmee' }, { statut: 'en_selection', delaiExpiration: { gt: new Date() } }],
    },
  });
  if (reservationsExistantes.length > 0) {
    const siegesIndisponibles = reservationsExistantes.map((r) => r.siegeId);
    throw httpError(409, `Ces sièges viennent d'être pris : ${siegesIndisponibles.join(', ')}.`);
  }

  const delaiExpiration = new Date(Date.now() + DUREE_SELECTION_MS);

  try {
    return await prisma.$transaction(
      siegeIds.map((siegeId) =>
        prisma.reservation.create({
          data: { spectateurId, siegeId, evenementId, statut: 'en_selection', delaiExpiration },
        }),
      ),
    );
  } catch (error) {
    // Un autre spectateur a réservé un des sièges entre notre vérification et la transaction : la
    // contrainte @@unique([siegeId, evenementId]) rejette l'insertion concernée, toute la transaction
    // est annulée (#16, #27, #38).
    if (error.code === 'P2002') {
      throw httpError(409, 'Un ou plusieurs sièges viennent d\'être pris entretemps.');
    }
    throw error;
  }
}

module.exports = { getReservationsByUser, reserverSieges };

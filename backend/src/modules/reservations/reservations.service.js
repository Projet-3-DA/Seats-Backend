const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');

const DUREE_SELECTION_MS = 15 * 60_000; // durée pendant laquelle un siège "en_selection" reste bloqué (#15, #32)

async function getReservationsByUser(spectateurId) {
  const reservations = await prisma.reservation.findMany({
    where: { spectateurId },
    include: { evenement: true, siege: true },
  });
  return reservations.map((r) => ({ ...r, terminee: r.evenement.dateHeure < new Date() }));
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
    // Un siège déjà réservé (confirmé ou en sélection par quelqu'un d'autre) viole la contrainte
    // @@unique([siegeId, evenementId]) : Prisma lève P2002, toute la transaction est annulée (#16, #27, #38).
    if (error.code === 'P2002') {
      throw httpError(409, 'Un ou plusieurs sièges viennent d\'être pris.');
    }
    throw error;
  }
}

module.exports = { getReservationsByUser, reserverSieges };

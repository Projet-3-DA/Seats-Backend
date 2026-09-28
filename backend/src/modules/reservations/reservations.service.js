const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');

async function getReservationsByUser(spectateurId) {
  return await prisma.reservation.findMany({
    where: { spectateurId },
    include: { evenement: true, siege: true },
  });
}

// Enregistre la réservation confirmée d'un ou plusieurs sièges libres pour un événement (#6). Appelée au
// clic sur « Confirmer » côté écran. Tout ou rien : soit tous les sièges demandés sont réservés, soit aucun.
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

  // delaiExpiration est obligatoire en base mais n'a plus de sens pour une réservation déjà confirmée.
  const maintenant = new Date();

  try {
    return await prisma.$transaction(
      siegeIds.map((siegeId) =>
        prisma.reservation.create({
          data: {
            spectateurId,
            siegeId,
            evenementId,
            statut: 'confirmee',
            dateConfirmation: maintenant,
            delaiExpiration: maintenant,
          },
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

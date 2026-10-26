const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');
const { prixSiege } = require('../../lib/prix');

async function getReservationsByUser(spectateurId) {
  const reservations = await prisma.reservation.findMany({
    where: { spectateurId },
    include: { evenement: true, siege: { include: { section: true } } },
  });
  // Prix payé pour la place : celui de la section du siège, sinon le tarif de l'événement (#11).
  return reservations.map((r) => ({
    ...r,
    prix: prixSiege(r.siege, r.evenement.tarif),
    terminee: r.evenement.dateHeure < new Date(),
  }));
}

// Enregistre la réservation confirmée d'un ou plusieurs sièges libres pour un événement (#6). Appelée au
// clic sur « Confirmer » côté écran. Tout ou rien : soit tous les sièges demandés sont réservés, soit aucun.
async function reserverSieges({ spectateurId, evenementId, siegeIds }) {
  const evenement = await prisma.evenement.findUnique({
    where: { id: evenementId },
    include: { salle: { include: { sieges: true } } },
  });
  if (!evenement) throw httpError(404, 'Cet événement n\'existe pas.');
  if (evenement.dateHeure <= new Date()) throw httpError(400, 'Cet événement est déjà passé.');

  const siegesDeLaSalle = new Set(evenement.salle.sieges.map((s) => s.id));
  const siegesInconnus = siegeIds.filter((id) => !siegesDeLaSalle.has(id));
  if (siegesInconnus.length > 0) {
    throw httpError(400, `Ces sièges n'appartiennent pas à la salle de l'événement : ${siegesInconnus.join(', ')}.`);
  }

  // delaiExpiration est obligatoire en base mais n'a plus de sens pour une réservation déjà confirmée.
  const maintenant = new Date();

  try {
    // Une sélection "en_selection" expirée (ancienne réservation jamais confirmée) occupe encore la
    // contrainte @@unique([siegeId, evenementId]) alors que le plan affiche le siège libre : sans ce
    // nettoyage, il serait refusé (409) pour toujours (#15, #32). Une sélection encore valide n'est
    // pas touchée : elle bloque toujours le siège. Tout est dans la même transaction que les créations.
    const [, ...reservations] = await prisma.$transaction([
      prisma.reservation.deleteMany({
        where: {
          evenementId,
          siegeId: { in: siegeIds },
          statut: 'en_selection',
          delaiExpiration: { lte: maintenant },
        },
      }),
      ...siegeIds.map((siegeId) =>
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
    ]);
    return reservations;
  } catch (error) {
    // Un siège déjà réservé (confirmé ou en sélection par quelqu'un d'autre) viole la contrainte
    // @@unique([siegeId, evenementId]) : Prisma lève P2002, toute la transaction est annulée (#16, #27, #38).
    if (error.code === 'P2002') {
      throw httpError(409, 'Un ou plusieurs sièges viennent d\'être pris.');
    }
    throw error;
  }
}

// Partagé par annulerReservation (#14) et annulerMaReservation (#12) : marque la réservation annulée
// et libère le siège (actif passe à NULL, ne compte plus dans la contrainte unique, voir schema.prisma).
// La condition sur le statut est dans la requête elle-même : deux annulations simultanées de la même
// réservation n'en appliquent qu'une, la seconde reçoit 409.
async function marquerAnnulee(reservationId, motif) {
  const { count } = await prisma.reservation.updateMany({
    where: { id: reservationId, statut: { not: 'annulee' } },
    data: { statut: 'annulee', actif: null, motifAnnulation: motif || null, dateAnnulation: new Date() },
  });
  if (count === 0) throw httpError(409, 'Cette réservation est déjà annulée.');

  return await prisma.reservation.findUnique({ where: { id: reservationId } });
}

// Annulation par l'organisateur de l'événement (#14). La réservation reste dans l'historique du
// spectateur (statut « annulee », motif et date).
async function annulerReservation({ reservationId, organisateurId, motif }) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { evenement: true },
  });
  if (!reservation) throw httpError(404, 'Réservation introuvable.');
  if (reservation.evenement.organisateurId !== organisateurId) {
    throw httpError(403, "Cette réservation concerne l'événement d'un autre organisateur.");
  }

  return marquerAnnulee(reservationId, motif);
}

// Annulation par le spectateur propriétaire de la réservation (#12). Possible uniquement avant la date
// de l'événement : une fois l'événement passé, la réservation reste dans l'historique telle quelle.
async function annulerMaReservation({ reservationId, spectateurId, motif }) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { evenement: true },
  });
  if (!reservation) throw httpError(404, 'Réservation introuvable.');
  if (reservation.spectateurId !== spectateurId) {
    throw httpError(403, 'Cette réservation ne vous appartient pas.');
  }
  if (reservation.evenement.dateHeure <= new Date()) {
    throw httpError(400, 'Cet événement a déjà eu lieu : la réservation ne peut plus être annulée.');
  }

  return marquerAnnulee(reservationId, motif);
}

module.exports = { getReservationsByUser, reserverSieges, annulerReservation, annulerMaReservation };

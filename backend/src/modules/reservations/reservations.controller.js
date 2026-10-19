const reservationsService = require('./reservations.service');
const { validateReserverSieges, validateAnnulation } = require('./reservations.validation');

async function getReservations(req, res, next) {
  try {
    const list = await reservationsService.getReservationsByUser(req.user.id);
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
}

async function reserverSieges(req, res, next) {
  try {
    const validationError = validateReserverSieges(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }
    const { evenementId, siegeIds } = req.body;
    const reservations = await reservationsService.reserverSieges({
      spectateurId: req.user.id,
      evenementId,
      siegeIds,
    });
    res.status(201).json({ success: true, data: reservations });
  } catch (error) {
    next(error);
  }
}

async function annulerReservation(req, res, next) {
  try {
    const reservationId = Number(req.params.id);
    if (!Number.isInteger(reservationId)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }
    const validationError = validateAnnulation(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }
    const reservation = await reservationsService.annulerReservation({
      reservationId,
      organisateurId: req.user.id,
      motif: req.body?.motif?.trim(),
    });
    res.json({ success: true, data: reservation });
  } catch (error) {
    next(error);
  }
}

async function annulerMaReservation(req, res, next) {
  try {
    const reservationId = Number(req.params.id);
    if (!Number.isInteger(reservationId)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }
    const validationError = validateAnnulation(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }
    const reservation = await reservationsService.annulerMaReservation({
      reservationId,
      spectateurId: req.user.id,
      motif: req.body?.motif?.trim(),
    });
    res.json({ success: true, data: reservation });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getReservations,
  reserverSieges,
  annulerReservation,
  annulerMaReservation,
};

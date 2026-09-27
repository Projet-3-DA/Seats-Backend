const reservationsService = require('./reservations.service');
const { validateReserverSieges } = require('./reservations.validation');

async function getReservations(req, res, next) {
  try {
    const list = await reservationsService.getReservationsByUser(req.user ? req.user.id : 1);
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

module.exports = {
  getReservations,
  reserverSieges,
};

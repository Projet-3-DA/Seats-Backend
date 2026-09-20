const reservationsService = require('./reservations.service');

async function getReservations(req, res, next) {
  try {
    const list = await reservationsService.getReservationsByUser(req.user ? req.user.id : 1);
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
}

async function createReservation(req, res, next) {
  try {
    const reservation = await reservationsService.createReservation(req.body);
    res.status(201).json({ success: true, data: reservation });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getReservations,
  createReservation,
};

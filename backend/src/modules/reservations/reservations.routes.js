const express = require('express');
const router = express.Router();
const reservationsController = require('./reservations.controller');

router.get('/', reservationsController.getReservations);
router.post('/', reservationsController.createReservation);

module.exports = router;

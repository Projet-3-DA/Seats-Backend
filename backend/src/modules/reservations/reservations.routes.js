const express = require('express');
const router = express.Router();
const reservationsController = require('./reservations.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

router.get('/', reservationsController.getReservations);
// spectateurId vient du token, jamais du corps de la requête : sinon n'importe quel client pourrait
// réserver "au nom" d'un autre utilisateur.
router.post('/', authMiddleware, roleMiddleware('spectateur'), reservationsController.reserverSieges);

module.exports = router;

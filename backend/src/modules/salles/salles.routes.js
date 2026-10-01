const express = require('express');
const router = express.Router();
const sallesController = require('./salles.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

router.get('/', sallesController.getSalles);
// organisateurId vient du token, jamais du corps de la requête (même principe que les réservations).
router.post('/', authMiddleware, roleMiddleware('organisateur'), sallesController.createSalle);
router.get('/:id', sallesController.getSalleById);
module.exports = router;

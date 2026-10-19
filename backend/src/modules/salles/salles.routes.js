const express = require('express');
const router = express.Router();
const sallesController = require('./salles.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

// Liste des salles de l'organisateur connecté : un spectateur n'a pas de salles (#9).
router.get('/', authMiddleware, roleMiddleware('organisateur'), sallesController.getSalles);
// organisateurId vient du token, jamais du corps de la requête (même principe que les réservations).
router.post('/', authMiddleware, roleMiddleware('organisateur'), sallesController.createSalle);
router.get('/:id', sallesController.getSalleById);
module.exports = router;

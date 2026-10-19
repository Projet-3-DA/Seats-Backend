const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

// Toutes les routes d'administration sont réservées aux administrateurs.
router.use(authMiddleware, roleMiddleware('administrateur'));

// Supervision de tous les événements, quel que soit l'organisateur (#36).
router.get('/evenements', adminController.getEvenements);
router.get('/evenements/:id', adminController.getEvenement);

module.exports = router;

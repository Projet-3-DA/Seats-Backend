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
// Liste des organisateurs inscrits et détail de chacun (#15).
router.get('/organisateurs', adminController.getOrganisateurs);
router.get('/organisateurs/:id', adminController.getOrganisateur);
// Suspension et réactivation d'un compte organisateur ou spectateur (#20).
router.get('/comptes', adminController.getComptes);
router.patch('/comptes/:id/statut', adminController.changerStatutCompte);

module.exports = router;

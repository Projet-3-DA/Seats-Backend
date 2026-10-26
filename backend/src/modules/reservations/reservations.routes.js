const express = require('express');
const router = express.Router();
const reservationsController = require('./reservations.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

// « Mes réservations » : seul un spectateur réserve, donc seul un spectateur consulte (#9).
router.get('/', authMiddleware, roleMiddleware('spectateur'), reservationsController.getReservations);
// spectateurId vient du token, jamais du corps de la requête : sinon n'importe quel client pourrait
// réserver "au nom" d'un autre utilisateur.
router.post('/', authMiddleware, roleMiddleware('spectateur'), reservationsController.reserverSieges);
// Annulation par l'organisateur (#14) : le service vérifie que la réservation concerne un de ses événements.
router.post('/:id/annulation', authMiddleware, roleMiddleware('organisateur'), reservationsController.annulerReservation);
// Annulation par le spectateur propriétaire (#12) : le service vérifie que la réservation lui appartient
// et que l'événement n'a pas encore eu lieu. Route distincte de /:id/annulation pour ne pas changer les
// règles d'accès de l'annulation côté organisateur.
router.post('/:id/annuler', authMiddleware, roleMiddleware('spectateur'), reservationsController.annulerMaReservation);

module.exports = router;

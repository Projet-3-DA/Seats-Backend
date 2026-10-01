const express = require('express');
const router = express.Router();
const evenementsController = require('./evenements.controller');
const { TYPES_ACCEPTES } = require('../../lib/storage');
const httpError = require('../../lib/http-error');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

router.get('/', evenementsController.getEvenements);
// organisateurId vient du token, jamais du corps de la requête (même principe que les réservations).
router.post('/', authMiddleware, roleMiddleware('organisateur'), evenementsController.createEvenement);
router.get('/:id/plan', evenementsController.getPlanSalle);
// Le corps est l'image brute (Content-Type: image/png, etc.), pas du JSON ni du multipart.
router.post('/affiche', authMiddleware, roleMiddleware('organisateur'), express.raw({ type: TYPES_ACCEPTES, limit: '5mb' }), evenementsController.uploadAffiche);
router.use('/affiche', (err, req, res, next) => {
  if (err.type === 'entity.too.large') return next(httpError(413, 'L\'image dépasse 5 Mo.'));
  next(err);
});

module.exports = router;

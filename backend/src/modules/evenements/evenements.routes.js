const express = require('express');
const router = express.Router();
const evenementsController = require('./evenements.controller');
const { TYPES_ACCEPTES } = require('../../lib/storage');
const httpError = require('../../lib/http-error');

router.get('/', evenementsController.getEvenements);
router.post('/', evenementsController.createEvenement);
router.get('/:id/plan', evenementsController.getPlanSalle);

// Le corps est l'image brute (Content-Type: image/png, etc.), pas du JSON ni du multipart.
router.post('/affiche', express.raw({ type: TYPES_ACCEPTES, limit: '5mb' }), evenementsController.uploadAffiche);
router.use('/affiche', (err, req, res, next) => {
  if (err.type === 'entity.too.large') return next(httpError(413, 'L\'image dépasse 5 Mo.'));
  next(err);
});

module.exports = router;
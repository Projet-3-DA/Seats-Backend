const express = require('express');
const router = express.Router();
const evenementsController = require('./evenements.controller');

router.get('/', evenementsController.getEvenements);
router.post('/', evenementsController.createEvenement);
router.get('/:id/plan', evenementsController.getPlanSalle);
module.exports = router;

const express = require('express');
const router = express.Router();
const evenementsController = require('./evenements.controller');

router.get('/', evenementsController.getEvenements);
router.post('/', evenementsController.createEvenement);

module.exports = router;

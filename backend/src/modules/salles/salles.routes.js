const express = require('express');
const router = express.Router();
const sallesController = require('./salles.controller');

router.get('/', sallesController.getSalles);
router.post('/', sallesController.createSalle);

module.exports = router;

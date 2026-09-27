const express = require('express');
const router = express.Router();
const sallesController = require('./salles.controller');

router.get('/', sallesController.getSalles);
router.post('/', sallesController.createSalle);
router.get('/:id', sallesController.getSalleById);
module.exports = router;

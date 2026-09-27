const express = require('express');
const router = express.Router();
const sallesController = require('./salles.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.get('/', authMiddleware, sallesController.getSalles);
router.post('/', sallesController.createSalle);
router.get('/:id', sallesController.getSalleById);
module.exports = router;

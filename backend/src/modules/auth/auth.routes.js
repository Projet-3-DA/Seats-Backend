const express = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);
router.get('/github', authController.github);
router.get('/github/callback', authController.githubCallback);

module.exports = router;
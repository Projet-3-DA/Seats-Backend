const express = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);
router.get('/github', authController.github);
router.get('/github/callback', authController.githubCallback);
// Après les routes GitHub : /:fournisseur ne doit pas les intercepter.
router.get('/fournisseurs', authController.fournisseurs);
router.get('/:fournisseur', authController.oidc);
router.get('/:fournisseur/callback', authController.oidcCallback);

module.exports = router;
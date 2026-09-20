function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Accès non autorisé. Token manquant ou invalide.',
    });
  }
  // TODO: Vérifier le JWT et injecter req.user
  next();
}

module.exports = authMiddleware;

function errorMiddleware(err, req, res, next) {
  console.error('[Error Handler]:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erreur interne du serveur';

  res.status(status).json({
    success: false,
    error: message,
  });
}

module.exports = errorMiddleware;

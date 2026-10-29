// Express reconnaît un gestionnaire d'erreurs à ses quatre paramètres : _next doit rester.
function errorMiddleware(err, req, res, _next) {
  console.error('[Error Handler]:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erreur interne du serveur';

  res.status(status).json({
    success: false,
    error: message,
  });
}

module.exports = errorMiddleware;

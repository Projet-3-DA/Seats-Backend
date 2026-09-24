// Erreur portant un code HTTP : error.middleware.js l'utilise pour répondre { success: false, error }.
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = httpError;

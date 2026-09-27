// Fonction pure de validation, séparée du controller pour pouvoir la tester sans HTTP ni base de données.

function validateReserverSieges(body) {
  const { evenementId, siegeIds } = body;
  if (!Number.isInteger(evenementId)) return 'evenementId est requis et doit être un entier.';
  if (!Array.isArray(siegeIds) || siegeIds.length === 0) {
    return 'siegeIds est requis et doit être une liste non vide de sièges à réserver.';
  }
  if (!siegeIds.every((id) => Number.isInteger(id))) return 'siegeIds ne doit contenir que des entiers.';
  if (new Set(siegeIds).size !== siegeIds.length) return 'siegeIds contient un doublon.';
  return null;
}

module.exports = {
  validateReserverSieges,
};

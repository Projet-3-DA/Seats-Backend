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

// Le motif d'annulation est facultatif (#14) ; s'il est fourni, c'est un texte de 500 caractères au plus.
const MOTIF_MAX = 500;

function validateAnnulation(body = {}) {
  const { motif } = body;
  if (motif === undefined || motif === null) return null;
  if (typeof motif !== 'string') return 'motif doit être un texte.';
  if (motif.trim().length > MOTIF_MAX) return `motif ne doit pas dépasser ${MOTIF_MAX} caractères.`;
  return null;
}

module.exports = {
  validateReserverSieges,
  validateAnnulation,
};

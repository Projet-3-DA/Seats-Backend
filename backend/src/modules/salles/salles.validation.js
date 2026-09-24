// Fonction pure de validation, séparée du controller pour pouvoir la tester sans HTTP ni base de données.

function validateCreateSalle(body) {
  const { organisateurId, nom, nombreRangees, siegesParRangee } = body;
  if (!Number.isInteger(organisateurId)) return 'organisateurId est requis et doit être un entier.';
  if (typeof nom !== 'string' || nom.trim().length === 0) return 'nom est requis.';
  if (!Number.isInteger(nombreRangees) || nombreRangees <= 0) return 'nombreRangees doit être un entier positif.';
  if (!Number.isInteger(siegesParRangee) || siegesParRangee <= 0) return 'siegesParRangee doit être un entier positif.';
  return null;
}

module.exports = {
  validateCreateSalle,
};

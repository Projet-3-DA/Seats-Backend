// Fonctions pures de validation, séparées du controller pour pouvoir les tester sans HTTP ni base de données.

function isUrlHttp(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isTarifValide(tarif) {
  return (
    typeof tarif === 'number' &&
    Number.isFinite(tarif) &&
    tarif >= 0 &&
    tarif <= 999999.99 &&
    Math.abs(tarif * 100 - Math.round(tarif * 100)) < 1e-6
  );
}

function validateCreateEvenement(body) {
  const { organisateurId, salleId, titre, description, dateHeure, afficheUrl, tarif } = body;
  if (!Number.isInteger(organisateurId)) return 'organisateurId est requis et doit être un entier.';
  if (!Number.isInteger(salleId)) return 'Une salle doit être attribuée à l\'événement.';
  if (typeof titre !== 'string' || titre.trim().length === 0) return 'titre est requis.';
  if (description != null && typeof description !== 'string') return 'description doit être une chaîne de caractères.';
  if (typeof dateHeure !== 'string' || Number.isNaN(Date.parse(dateHeure))) return 'dateHeure est requis et doit être une date valide.';
  if (new Date(dateHeure) <= new Date()) return 'La date de l\'événement est déjà passée.';
  if (tarif == null) return 'Le tarif est requis (0 si l\'événement est gratuit).';
  if (!isTarifValide(tarif)) return 'tarif doit être un montant positif avec au plus 2 décimales.';
  if (afficheUrl != null && afficheUrl !== '') {
    if (typeof afficheUrl !== 'string' || afficheUrl.length > 2048 || !isUrlHttp(afficheUrl.trim())) {
      return 'afficheUrl doit être un lien http(s) valide.';
    }
  }
  return null;
}

module.exports = {
  isUrlHttp,
  isTarifValide,
  validateCreateEvenement,
};

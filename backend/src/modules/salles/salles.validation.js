// Fonction pure de validation, séparée du controller pour pouvoir la tester sans HTTP ni base de données.

function validateCreateSalle(body) {
  const { organisateurId, nom, nombreRangees, siegesParRangee } = body;
  if (!Number.isInteger(organisateurId)) return 'organisateurId est requis et doit être un entier.';
  if (typeof nom !== 'string' || nom.trim().length === 0) return 'nom est requis.';
  if (!Number.isInteger(nombreRangees) || nombreRangees <= 0) return 'nombreRangees doit être un entier positif.';
  if (!Number.isInteger(siegesParRangee) || siegesParRangee <= 0) return 'siegesParRangee doit être un entier positif.';
  return null;
}

// Sections tarifaires (#11) : la liste complète des sections de la salle, qui remplace l'ancienne.
const SECTIONS_MAX = 20;
const NOM_SECTION_MAX = 50;
const PRIX_MAX = 999999.99; // Decimal(8, 2) en base
const COULEUR = /^#[0-9a-fA-F]{6}$/;

function validateSections(body) {
  const { sections } = body ?? {};
  if (!Array.isArray(sections)) return 'sections est requis et doit être une liste.';
  if (sections.length > SECTIONS_MAX) return `Une salle compte au plus ${SECTIONS_MAX} sections.`;

  const noms = new Set();
  const siegesAssignes = new Set();
  for (const [index, section] of sections.entries()) {
    const nom = typeof section?.nom === 'string' ? section.nom.trim() : '';
    if (nom.length === 0) return `Section ${index + 1} : le nom est requis.`;
    if (nom.length > NOM_SECTION_MAX) return `Le nom « ${nom} » dépasse ${NOM_SECTION_MAX} caractères.`;
    const cle = nom.toLowerCase();
    if (noms.has(cle)) return `Deux sections portent le nom « ${nom} ».`;
    noms.add(cle);

    const { prix } = section;
    if (typeof prix !== 'number' || !Number.isFinite(prix) || prix < 0 || prix > PRIX_MAX) {
      return `Section « ${nom} » : le prix doit être un montant entre 0 et ${PRIX_MAX}.`;
    }
    if (Math.abs(Math.round(prix * 100) - prix * 100) > 1e-6) {
      return `Section « ${nom} » : le prix a au plus 2 décimales.`;
    }
    if (typeof section.couleur !== 'string' || !COULEUR.test(section.couleur)) {
      return `Section « ${nom} » : la couleur doit être au format #RRGGBB.`;
    }

    const { siegeIds } = section;
    if (!Array.isArray(siegeIds) || siegeIds.length === 0) {
      return `La section « ${nom} » ne contient aucun siège.`;
    }
    if (!siegeIds.every((id) => Number.isInteger(id))) return `Section « ${nom} » : siegeIds ne doit contenir que des entiers.`;
    for (const id of siegeIds) {
      // Critère de #11 : chaque siège appartient à une seule section à la fois.
      if (siegesAssignes.has(id)) return `Le siège ${id} est assigné à plusieurs sections : un siège n'appartient qu'à une seule section.`;
      siegesAssignes.add(id);
    }
  }
  return null;
}

module.exports = {
  validateCreateSalle,
  validateSections,
};

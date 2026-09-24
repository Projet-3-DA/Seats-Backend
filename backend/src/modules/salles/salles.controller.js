const sallesService = require('./salles.service');

function validateCreateSalle(body) {
  const { organisateurId, nom, nombreRangees, siegesParRangee } = body;
  if (!Number.isInteger(organisateurId)) return 'organisateurId est requis et doit être un entier.';
  if (typeof nom !== 'string' || nom.trim().length === 0) return 'nom est requis.';
  if (!Number.isInteger(nombreRangees) || nombreRangees <= 0) return 'nombreRangees doit être un entier positif.';
  if (!Number.isInteger(siegesParRangee) || siegesParRangee <= 0) return 'siegesParRangee doit être un entier positif.';
  return null;
}

async function getSalles(req, res, next) {
  try {
    const salles = await sallesService.getAllSalles();
    res.json({ success: true, data: salles });
  } catch (error) {
    next(error);
  }
}

async function createSalle(req, res, next) {
  try {
    const validationError = validateCreateSalle(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }
    const salle = await sallesService.createSalle(req.body);
    res.status(201).json({ success: true, data: salle });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Cette organisation a déjà une salle avec ce nom.' });
    }
    next(error);
  }
}

module.exports = {
  getSalles,
  createSalle,
};

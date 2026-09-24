const evenementsService = require('./evenements.service');

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

async function getEvenements(req, res, next) {
  try {
    const list = await evenementsService.getAllEvenements();
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
}

async function createEvenement(req, res, next) {
  try {
    const validationError = validateCreateEvenement(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }
    const { organisateurId, salleId, titre, description, dateHeure, afficheUrl, tarif } = req.body;
    const evenement = await evenementsService.createEvenement({
      organisateurId,
      salleId,
      titre: titre.trim(),
      description: description?.trim() || null,
      dateHeure: new Date(dateHeure),
      afficheUrl: afficheUrl?.trim() || null,
      tarif,
    });
    res.status(201).json({ success: true, data: evenement });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ success: false, error: 'Organisateur introuvable.' });
    }
    next(error);
  }
}

// express.raw() (dans les routes) ne remplit req.body que si le Content-Type est une image acceptée
async function uploadAffiche(req, res, next) {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Image manquante ou format non pris en charge (JPEG, PNG, WebP ou GIF).',
      });
    }
    const url = await evenementsService.uploadAffiche(req.body, req.headers['content-type']);
    res.status(201).json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
}

async function getPlanSalle(req, res, next) {
  try {
    const evenementId = Number(req.params.id);
    if (Number.isNaN(evenementId)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }

    const plan = await evenementsService.getPlanSalle(evenementId);
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Événement introuvable' });
    }

    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getEvenements,
  createEvenement,
  getPlanSalle,
  uploadAffiche
};

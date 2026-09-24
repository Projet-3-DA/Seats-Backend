const evenementsService = require('./evenements.service');
const { validateCreateEvenement } = require('./evenements.validation');

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

const sallesService = require('./salles.service');
const { validateCreateSalle } = require('./salles.validation');

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
    const body = { ...req.body, organisateurId: req.user.id };
    const validationError = validateCreateSalle(body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }
    const salle = await sallesService.createSalle(body);
    res.status(201).json({ success: true, data: salle });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Cette organisation a déjà une salle avec ce nom.' });
    }
    next(error);
  }
}
async function getSalleById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }
    const salle = await sallesService.getSalleById(id);
    if (!salle) {
      return res.status(404).json({ success: false, error: 'Salle introuvable' });
    }
    res.json({ success: true, data: salle });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSalles,
  getSalleById,
  createSalle,
};
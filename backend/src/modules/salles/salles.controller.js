const sallesService = require('./salles.service');
const { validateCreateSalle } = require('./salles.validation');

async function getSalles(req, res, next) {
  try {
    const salles = await sallesService.getAllSalles(req.user.id);
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

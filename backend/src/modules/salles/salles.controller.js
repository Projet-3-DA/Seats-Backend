const sallesService = require('./salles.service');

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
    const salle = await sallesService.createSalle(req.body);
    res.status(201).json({ success: true, data: salle });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSalles,
  createSalle,
};

const evenementsService = require('./evenements.service');

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
    const evenement = await evenementsService.createEvenement(req.body);
    res.status(201).json({ success: true, data: evenement });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getEvenements,
  createEvenement,
};

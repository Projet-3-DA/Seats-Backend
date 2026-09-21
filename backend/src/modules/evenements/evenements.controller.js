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
};

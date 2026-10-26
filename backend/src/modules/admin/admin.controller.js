const adminService = require('./admin.service');

async function getEvenements(req, res, next) {
  try {
    const evenements = await adminService.getEvenements();
    res.json({ success: true, data: evenements });
  } catch (error) {
    next(error);
  }
}

async function getEvenement(req, res, next) {
  try {
    const evenementId = Number(req.params.id);
    if (!Number.isInteger(evenementId)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }
    const evenement = await adminService.getEvenement(evenementId);
    res.json({ success: true, data: evenement });
  } catch (error) {
    next(error);
  }
}

module.exports = { getEvenements, getEvenement };

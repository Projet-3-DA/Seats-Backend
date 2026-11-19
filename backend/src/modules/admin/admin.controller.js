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

async function getOrganisateurs(req, res, next) {
  try {
    const organisateurs = await adminService.getOrganisateurs();
    res.json({ success: true, data: organisateurs });
  } catch (error) {
    next(error);
  }
}

async function getOrganisateur(req, res, next) {
  try {
    const organisateurId = Number(req.params.id);
    if (!Number.isInteger(organisateurId)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }
    const organisateur = await adminService.getOrganisateur(organisateurId);
    res.json({ success: true, data: organisateur });
  } catch (error) {
    next(error);
  }
}

async function getComptes(req, res, next) {
  try {
    const comptes = await adminService.getComptes();
    res.json({ success: true, data: comptes });
  } catch (error) {
    next(error);
  }
}

async function changerStatutCompte(req, res, next) {
  try {
    const compteId = Number(req.params.id);
    if (!Number.isInteger(compteId)) {
      return res.status(400).json({ success: false, error: 'id invalide' });
    }
    const { statut, raison } = req.body ?? {};
    const compte = await adminService.changerStatutCompte(compteId, { statut, raison });
    res.json({ success: true, data: compte });
  } catch (error) {
    next(error);
  }
}

module.exports = { getEvenements, getEvenement, getOrganisateurs, getOrganisateur, getComptes, changerStatutCompte };

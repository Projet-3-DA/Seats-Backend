const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');
const storage = require('../../lib/storage');
const { prixSiege, formatSection } = require('../../lib/prix');

// Seuls les événements à venir sont proposés, du plus proche au plus lointain (#82).
async function getAllEvenements() {
  return await prisma.evenement.findMany({
    where: { dateHeure: { gt: new Date() } },
    orderBy: { dateHeure: 'asc' },
    include: { salle: true },
  });
}

// La salle doit exister et appartenir à l'organisateur qui crée l'événement
async function createEvenement({ organisateurId, salleId, titre, description, dateHeure, afficheUrl, tarif }) {
  const salle = await prisma.salle.findUnique({ where: { id: salleId } });
  if (!salle) throw httpError(404, 'Cette salle n\'existe pas.');
  if (salle.organisateurId !== organisateurId) {
    throw httpError(403, 'Cette salle n\'appartient pas à cet organisateur.');
  }
  return await prisma.evenement.create({
    data: { organisateurId, salleId, titre, description, dateHeure, afficheUrl, tarif },
    include: { salle: true },
  });
}

// Renvoie l'URL publique de l'affiche, à passer ensuite à createEvenement (afficheUrl)
async function uploadAffiche(buffer, contentType) {
  return await storage.uploadImage(buffer, contentType);
}

async function getPlanSalle(evenementId) {
  const evenement = await prisma.evenement.findUnique({
    where: { id: evenementId },
    include: {
      salle: { include: { sieges: { include: { section: true } }, sections: true } },
     reservations: {
  // Un siège est indisponible s'il est confirmé, ou en sélection avec un délai non expiré (#6, #30).
  where: {
    OR: [
      { statut: 'confirmee' },
      { statut: 'en_selection', delaiExpiration: { gt: new Date() } },
    ],
  },
  select: { siegeId: true },
},
    },
  });

  if (!evenement) return null;

  const siegesReserves = new Set(evenement.reservations.map((r) => r.siegeId));

  return {
    evenementId: evenement.id,
    dateHeure: evenement.dateHeure,
    salle: { id: evenement.salle.id, nom: evenement.salle.nom },
    // Sections tarifaires de la salle (#11) ; vide si la salle est au tarif unique de l'événement.
    sections: evenement.salle.sections.map(formatSection),
    sieges: evenement.salle.sieges.map((s) => ({
      id: s.id,
      rangee: s.numeroRangee,
      colonne: s.numeroColonne,
      etat: siegesReserves.has(s.id) ? 'reserve' : 'libre',
      sectionId: s.sectionId ?? null,
      prix: prixSiege(s, evenement.tarif),
    })),
  };
}

// Tableau de bord des ventes (#13) : vendus, en sélection et libres, siège par siège. Réservé à
// l'organisateur de l'événement. Une sélection expirée ne bloque plus rien : le siège compte comme libre.
async function getVentesEvenement(evenementId, organisateurId) {
  const evenement = await prisma.evenement.findUnique({
    where: { id: evenementId },
    include: {
      salle: { include: { sieges: { include: { section: true } }, sections: true } },
      reservations: {
        where: {
          OR: [
            { statut: 'confirmee' },
            { statut: 'en_selection', delaiExpiration: { gt: new Date() } },
          ],
        },
        select: {
          id: true,
          siegeId: true,
          statut: true,
          spectateur: { select: { prenom: true, nom: true, email: true } },
        },
      },
    },
  });

  if (!evenement) throw httpError(404, 'Événement introuvable.');
  if (evenement.organisateurId !== organisateurId) {
    throw httpError(403, "Cet événement n'appartient pas à cet organisateur.");
  }

  const reservationParSiege = new Map(evenement.reservations.map((r) => [r.siegeId, r]));
  const sieges = evenement.salle.sieges
    .map((s) => {
      const r = reservationParSiege.get(s.id);
      const siege = {
        id: s.id,
        rangee: s.numeroRangee,
        colonne: s.numeroColonne,
        sectionId: s.sectionId ?? null,
        prix: prixSiege(s, evenement.tarif),
      };
      if (!r) return { ...siege, etat: 'libre' };
      // La réservation et son spectateur servent à l'annulation par l'organisateur (#14).
      return {
        ...siege,
        etat: r.statut === 'confirmee' ? 'vendu' : 'en_selection',
        reservation: { id: r.id, spectateur: r.spectateur },
      };
    })
    .sort((a, b) => a.rangee - b.rangee || a.colonne - b.colonne);

  const compter = (etat) => sieges.filter((s) => s.etat === etat).length;
  const vendus = compter('vendu');
  const tarif = evenement.tarif === null || evenement.tarif === undefined ? null : Number(evenement.tarif);

  return {
    evenement: { id: evenement.id, titre: evenement.titre, dateHeure: evenement.dateHeure, tarif },
    salle: { id: evenement.salle.id, nom: evenement.salle.nom },
    totaux: { total: sieges.length, vendus, enSelection: compter('en_selection'), libres: compter('libre') },
    // Chaque place vendue rapporte le prix de sa section, ou le tarif de l'événement hors section (#11).
    recette: tarif === null && evenement.salle.sections.length === 0
      ? null
      : sieges.filter((s) => s.etat === 'vendu').reduce((total, s) => total + (s.prix ?? 0), 0),
    sections: evenement.salle.sections.map(formatSection),
    sieges,
  };
}

module.exports = {
  getAllEvenements,
  createEvenement,
  getPlanSalle,
  getVentesEvenement,
  uploadAffiche
};

const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');
const storage = require('../../lib/storage');

async function getAllEvenements() {
  return await prisma.evenement.findMany({ include: { salle: true } });
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
      salle: { include: { sieges: true } },
      reservations: {
        where: { statut: 'confirmee' },
        select: { siegeId: true },
      },
    },
  });

  if (!evenement) return null;

  const siegesReserves = new Set(evenement.reservations.map((r) => r.siegeId));

  return {
    evenementId: evenement.id,
    salle: { id: evenement.salle.id, nom: evenement.salle.nom },
    sieges: evenement.salle.sieges.map((s) => ({
      id: s.id,
      rangee: s.numeroRangee,
      colonne: s.numeroColonne,
      etat: siegesReserves.has(s.id) ? 'reserve' : 'libre',
    })),
  };
}

module.exports = {
  getAllEvenements,
  createEvenement,
  getPlanSalle,
  uploadAffiche
};

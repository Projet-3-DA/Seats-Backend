const prisma = require('../../lib/prisma');

async function getAllEvenements() {
  return await prisma.evenement.findMany({ include: { salle: true } });
}

async function createEvenement(data) {
  return await prisma.evenement.create({ data });
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
};

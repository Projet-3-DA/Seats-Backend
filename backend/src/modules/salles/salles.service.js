const prisma = require('../../lib/prisma');

async function getAllSalles() {
  return await prisma.salle.findMany({ include: { sieges: true } });
}

function buildSiegesData(salleId, nombreRangees, siegesParRangee) {
  const sieges = [];
  for (let rangee = 1; rangee <= nombreRangees; rangee++) {
    for (let colonne = 1; colonne <= siegesParRangee; colonne++) {
      sieges.push({ salleId, numeroRangee: rangee, numeroColonne: colonne });
    }
  }
  return sieges;
}

// Crée la salle et ses sièges dans une seule transaction
async function createSalle({ organisateurId, nom, nombreRangees, siegesParRangee }) {
  return await prisma.$transaction(async (tx) => {
    const salle = await tx.salle.create({
      data: { organisateurId, nom, nombreRangees, siegesParRangee },
    });
    await tx.siege.createMany({
      data: buildSiegesData(salle.id, nombreRangees, siegesParRangee),
    });
    return await tx.salle.findUnique({
      where: { id: salle.id },
      include: { sieges: true },
    });
  });
}
async function getSalleById(id) {
  return await prisma.salle.findUnique({
    where: { id },
    include: { sieges: true },
  });
}

module.exports = {
  getAllSalles,
  getSalleById,
  createSalle,
};
const prisma = require('../../lib/prisma');

async function getAllSalles() {
  return await prisma.salle.findMany({ include: { sieges: true } });
}

async function createSalle(data) {
  // TODO: Générer automatiquement les Sièges associés
  return await prisma.salle.create({ data });
}

module.exports = {
  getAllSalles,
  createSalle,
};

const prisma = require('../../lib/prisma');

async function getAllEvenements() {
  return await prisma.evenement.findMany({ include: { salle: true } });
}

async function createEvenement(data) {
  return await prisma.evenement.create({ data });
}

module.exports = {
  getAllEvenements,
  createEvenement,
};

const prisma = require('../../lib/prisma');

async function getReservationsByUser(spectateurId) {
  return await prisma.reservation.findMany({
    where: { spectateurId },
    include: { evenement: true, siege: true },
  });
}

async function createReservation(data) {
  // TODO: Gestion du conflit de siège et délai d'expiration (15 min)
  return await prisma.reservation.create({ data });
}

module.exports = {
  getReservationsByUser,
  createReservation,
};

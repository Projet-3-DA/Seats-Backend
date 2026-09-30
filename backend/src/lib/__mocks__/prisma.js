// Mock manuel utilisé par `jest.mock('../../lib/prisma')` dans les tests : simule Prisma sans base
// de données. Jest le prend automatiquement grâce au dossier __mocks__ voisin de lib/prisma.js.
// `clearMocks: true` (jest config) réinitialise l'historique d'appels entre chaque test.

const prisma = {
  utilisateur: {
    create: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  salle: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  siege: {
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
  evenement: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  reservation: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  // Supporte les deux formes de `prisma.$transaction` :
  //  - callback : `prisma.$transaction(async (tx) => { await tx.salle.create(...) })`, testable en
  //    configurant directement prisma.salle.create, sans rien connaître d'une vraie transaction.
  //  - tableau : `prisma.$transaction([promesse1, promesse2])`, résolu comme Promise.all (si l'une
  //    des promesses rejette, toute la transaction rejette, comme la vraie annulation Prisma).
  $transaction: jest.fn((operations) =>
    Array.isArray(operations) ? Promise.all(operations) : operations(prisma),
  ),
};

module.exports = prisma;

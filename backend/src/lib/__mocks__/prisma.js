// Mock manuel utilisé par `jest.mock('../../lib/prisma')` dans les tests : simule Prisma sans base
// de données. Jest le prend automatiquement grâce au dossier __mocks__ voisin de lib/prisma.js.
// `clearMocks: true` (jest config) réinitialise l'historique d'appels entre chaque test.

const prisma = {
  utilisateur: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  salle: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  siege: {
    createMany: jest.fn(),
  },
  evenement: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  reservation: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  // Exécute le callback avec le même mock en guise de transaction (tx) : les modules qui font
  // `prisma.$transaction(async (tx) => { await tx.salle.create(...) })` peuvent être testés en
  // configurant directement prisma.salle.create, sans rien connaître d'une vraie transaction.
  $transaction: jest.fn((callback) => callback(prisma)),
};

module.exports = prisma;

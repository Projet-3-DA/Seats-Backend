jest.mock('../src/lib/prisma');

const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { COMPTES_DEMO, MOT_DE_PASSE_DEMO, creerComptesDemo } = require('./seed');

describe('creerComptesDemo', () => {
  it('crée un compte par rôle', async () => {
    await creerComptesDemo();

    expect(prisma.utilisateur.upsert).toHaveBeenCalledTimes(3);
    const roles = prisma.utilisateur.upsert.mock.calls.map(([args]) => args.create.role);
    expect(roles.sort()).toEqual(['administrateur', 'organisateur', 'spectateur']);
  });

  it('ne modifie pas un compte déjà existant (redémarrage sans réinitialisation)', async () => {
    await creerComptesDemo();

    prisma.utilisateur.upsert.mock.calls.forEach(([args]) => {
      expect(args.update).toEqual({});
      expect(args.where).toEqual({ email: args.create.email });
    });
  });

  it('stocke le mot de passe haché, jamais en clair, et il permet de se connecter', async () => {
    await creerComptesDemo();

    const [{ create }] = prisma.utilisateur.upsert.mock.calls[0];
    expect(create.motDePasse).not.toBe(MOT_DE_PASSE_DEMO);
    await expect(bcrypt.compare(MOT_DE_PASSE_DEMO, create.motDePasse)).resolves.toBe(true);
  });

  it('utilise des adresses distinctes', () => {
    const emails = COMPTES_DEMO.map((c) => c.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});

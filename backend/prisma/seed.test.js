jest.mock('../src/lib/prisma');

const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { COMPTES_DEMO, SALLES_DEMO, EVENEMENTS_DEMO, MOT_DE_PASSE_DEMO, creerComptesDemo, creerDonneesDemo } = require('./seed');

let prochainId;

beforeEach(() => {
  prochainId = 1;
  const avecId = async (args) => ({ id: prochainId++, ...(args.create ?? args.data) });
  prisma.utilisateur.upsert.mockImplementation(avecId);
  prisma.salle.upsert.mockImplementation(avecId);
  prisma.evenement.findFirst.mockResolvedValue(null);
  prisma.evenement.create.mockImplementation(avecId);
  prisma.siege.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: 1000 + i })));
});

describe('creerComptesDemo', () => {
  it('crée les comptes, avec au moins un par rôle', async () => {
    await creerComptesDemo();

    expect(prisma.utilisateur.upsert).toHaveBeenCalledTimes(COMPTES_DEMO.length);
    const roles = new Set(prisma.utilisateur.upsert.mock.calls.map(([args]) => args.create.role));
    expect(roles).toEqual(new Set(['spectateur', 'organisateur', 'administrateur']));
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

describe('creerDonneesDemo', () => {
  it('crée les salles de l\'organisateur démo avec tous leurs sièges, sans doublon', async () => {
    await creerDonneesDemo();

    expect(prisma.salle.upsert).toHaveBeenCalledTimes(SALLES_DEMO.length);
    const lots = prisma.siege.createMany.mock.calls.map(([args]) => args);
    expect(lots.map((l) => l.data.length)).toEqual(SALLES_DEMO.map((s) => s.nombreRangees * s.siegesParRangee));
    lots.forEach((lot) => expect(lot.skipDuplicates).toBe(true));
  });

  it('crée les événements à venir, avec et sans affiche, dont un gratuit', async () => {
    await creerDonneesDemo();

    expect(prisma.evenement.create).toHaveBeenCalledTimes(EVENEMENTS_DEMO.length);
    const evenements = prisma.evenement.create.mock.calls.map(([args]) => args.data);
    evenements.forEach((e) => expect(e.dateHeure.getTime()).toBeGreaterThan(Date.now()));
    expect(evenements.some((e) => e.afficheUrl === null)).toBe(true);
    expect(evenements.some((e) => e.afficheUrl?.startsWith('https://'))).toBe(true);
    expect(evenements.some((e) => e.tarif === 0)).toBe(true);
  });

  it('ne recrée pas un événement déjà présent (redémarrage sans doublon)', async () => {
    prisma.evenement.findFirst.mockImplementation(async ({ where }) => ({ id: 99, salleId: 1, titre: where.titre }));

    await creerDonneesDemo();

    expect(prisma.evenement.create).not.toHaveBeenCalled();
  });

  it('crée des réservations confirmées sans écraser celles qui existent', async () => {
    await creerDonneesDemo();

    expect(prisma.reservation.createMany).toHaveBeenCalled();
    prisma.reservation.createMany.mock.calls.forEach(([args]) => {
      expect(args.skipDuplicates).toBe(true);
      args.data.forEach((r) => expect(r.statut).toBe('confirmee'));
    });
  });
});

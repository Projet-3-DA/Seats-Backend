jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllEvenements, createEvenement } = require('./evenements.service');

// "refuse une date passée" et "refuse la publication sans salle attribuée" sont couverts, mais dans
// evenements.validation.test.js (c'est validateCreateEvenement qui s'en charge, avant que le service
// soit appelé) — pas de nouveau todo ici pour éviter la confusion sur la couche.
it.todo("getAllEvenements() ne retourne que les événements dont la date n'est pas passée (#4)");
it.todo('getAllEvenements() peut être filtré par date ou par lieu, filtres combinables (#21)');
it.todo('getAllEvenements() peut être dupliqué pour créer rapidement une nouvelle séance (#23)');

describe('getAllEvenements', () => {
  it('liste les evenements avec leur salle', async () => {
    const rows = [{ id: 1, titre: 'Concert', salle: { id: 1, nom: 'Salle A' } }];
    prisma.evenement.findMany.mockResolvedValue(rows);

    await expect(getAllEvenements()).resolves.toEqual(rows);
    expect(prisma.evenement.findMany).toHaveBeenCalledWith({ include: { salle: true } });
  });
});

describe('createEvenement', () => {
  const data = { organisateurId: 1, salleId: 19, titre: 'Concert', dateHeure: new Date(), tarif: 25 };

  it('crée un evenement quand la salle existe et appartient à l\'organisateur', async () => {
    const created = { id: 1, ...data };
    prisma.salle.findUnique.mockImplementation(async (args) => {
      expect(args).toEqual({ where: { id: 19 } });
      return { id: 19, organisateurId: 1 };
    });
    prisma.evenement.create.mockResolvedValue(created);

    await expect(createEvenement(data)).resolves.toEqual(created);
    expect(prisma.evenement.create).toHaveBeenCalledWith({ data, include: { salle: true } });
  });

  it("refuse (404) si la salle n'existe pas", async () => {
    prisma.salle.findUnique.mockResolvedValue(null);

    await expect(createEvenement({ ...data, salleId: 999 })).rejects.toMatchObject({ status: 404 });
    expect(prisma.evenement.create).not.toHaveBeenCalled();
  });

  it('refuse (403) si la salle appartient à un autre organisateur', async () => {
    prisma.salle.findUnique.mockResolvedValue({ id: 19, organisateurId: 2 });

    await expect(createEvenement(data)).rejects.toMatchObject({ status: 403 });
  });
});

jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllEvenements, createEvenement, getPlanSalle } = require('./evenements.service');

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

describe('getPlanSalle', () => {
  it.todo("distingue un siège en_selection par un autre spectateur (#26, #30, #31)");

  it('renvoie null si l\'événement n\'existe pas', async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    await expect(getPlanSalle(999)).resolves.toBeNull();
  });

  it('marque réservés les sièges confirmés et libres les autres', async () => {
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      salle: {
        id: 19,
        nom: 'Salle A',
        sieges: [
          { id: 101, numeroRangee: 1, numeroColonne: 1 },
          { id: 102, numeroRangee: 1, numeroColonne: 2 },
        ],
      },
      reservations: [{ siegeId: 101 }],
    });

    await expect(getPlanSalle(1)).resolves.toEqual({
      evenementId: 1,
      salle: { id: 19, nom: 'Salle A' },
      sieges: [
        { id: 101, rangee: 1, colonne: 1, etat: 'reserve' },
        { id: 102, rangee: 1, colonne: 2, etat: 'libre' },
      ],
    });
  });

  it('ne charge que les réservations confirmées', async () => {
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      salle: { id: 19, nom: 'Salle A', sieges: [] },
      reservations: [],
    });

    await getPlanSalle(1);

    expect(prisma.evenement.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: {
        salle: { include: { sieges: true } },
        reservations: { where: { statut: 'confirmee' }, select: { siegeId: true } },
      },
    });
  });
});

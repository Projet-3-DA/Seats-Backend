jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllEvenements, createEvenement, getPlanSalle } = require('./evenements.service');

// "refuse une date passée" et "refuse la publication sans salle attribuée" sont couverts, mais dans
// evenements.validation.test.js (c'est validateCreateEvenement qui s'en charge, avant que le service
// soit appelé) — pas de nouveau todo ici pour éviter la confusion sur la couche.
it.todo('getAllEvenements() peut être filtré par date ou par lieu, filtres combinables (#21)');
it.todo('getAllEvenements() peut être dupliqué pour créer rapidement une nouvelle séance (#23)');

describe('getAllEvenements', () => {
  it('liste les evenements avec leur salle', async () => {
    const rows = [{ id: 1, titre: 'Concert', salle: { id: 1, nom: 'Salle A' } }];
    prisma.evenement.findMany.mockResolvedValue(rows);

    await expect(getAllEvenements()).resolves.toEqual(rows);
    expect(prisma.evenement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { salle: true } }),
    );
  });

  it('ne retourne que les événements à venir, du plus proche au plus lointain (#4, #82)', async () => {
    prisma.evenement.findMany.mockResolvedValue([]);

    const avant = Date.now();
    await getAllEvenements();
    const apres = Date.now();

    const { where, orderBy } = prisma.evenement.findMany.mock.calls[0][0];
    const limite = where.dateHeure.gt.getTime();
    expect(limite).toBeGreaterThanOrEqual(avant);
    expect(limite).toBeLessThanOrEqual(apres);
    expect(orderBy).toEqual({ dateHeure: 'asc' });
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

  it("renvoie null si l'événement n'existe pas", async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    await expect(getPlanSalle(999)).resolves.toBeNull();
  });

  it('marque réservés les sièges indisponibles et libres les autres', async () => {
    const dateHeure = new Date('2026-11-05T19:00:00Z');
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      dateHeure,
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
      dateHeure,
      salle: { id: 19, nom: 'Salle A' },
      sieges: [
        { id: 101, rangee: 1, colonne: 1, etat: 'reserve' },
        { id: 102, rangee: 1, colonne: 2, etat: 'libre' },
      ],
    });
  });

  it('charge les réservations confirmées et celles en sélection non expirées', async () => {
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
        reservations: {
          where: {
            OR: [
              { statut: 'confirmee' },
              { statut: 'en_selection', delaiExpiration: { gt: expect.any(Date) } },
            ],
          },
          select: { siegeId: true },
        },
      },
    });
  });

  it('ignore les sélections expirées en comparant le délai à la date courante', async () => {
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      salle: { id: 19, nom: 'Salle A', sieges: [] },
      reservations: [],
    });

    const avant = Date.now();
    await getPlanSalle(1);
    const apres = Date.now();

    const { where } = prisma.evenement.findUnique.mock.calls[0][0].include.reservations;
    const limite = where.OR[1].delaiExpiration.gt.getTime();
    expect(limite).toBeGreaterThanOrEqual(avant);
    expect(limite).toBeLessThanOrEqual(apres);
  });
});
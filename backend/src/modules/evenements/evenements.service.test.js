jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllEvenements, createEvenement, getPlanSalle, getVentesEvenement } = require('./evenements.service');

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
        sections: [],
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
      sections: [],
      sieges: [
        { id: 101, rangee: 1, colonne: 1, etat: 'reserve', sectionId: null, prix: null },
        { id: 102, rangee: 1, colonne: 2, etat: 'libre', sectionId: null, prix: null },
      ],
    });
  });

  it('charge les réservations confirmées et celles en sélection non expirées', async () => {
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      salle: { id: 19, nom: 'Salle A', sieges: [], sections: [] },
      reservations: [],
    });

    await getPlanSalle(1);

    expect(prisma.evenement.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: {
        salle: { include: { sieges: { include: { section: true } }, sections: true } },
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
      salle: { id: 19, nom: 'Salle A', sieges: [], sections: [] },
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

describe('getVentesEvenement (#13)', () => {
  const evenement = {
    id: 1,
    organisateurId: 7,
    titre: 'Concert',
    dateHeure: new Date('2026-11-05T19:00:00Z'),
    tarif: '25.00', // Prisma renvoie un Decimal : on vérifie qu'il est converti en nombre
    salle: {
      id: 19,
      nom: 'Salle A',
      sections: [],
      sieges: [
        { id: 104, numeroRangee: 2, numeroColonne: 1 },
        { id: 101, numeroRangee: 1, numeroColonne: 1 },
        { id: 102, numeroRangee: 1, numeroColonne: 2 },
        { id: 103, numeroRangee: 1, numeroColonne: 3 },
      ],
    },
    reservations: [
      { id: 1, siegeId: 101, statut: 'confirmee', spectateur: { prenom: 'Ana', nom: 'B', email: 'ana@x.ca' } },
      { id: 3, siegeId: 103, statut: 'confirmee', spectateur: { prenom: 'Léo', nom: 'C', email: 'leo@x.ca' } },
      { id: 2, siegeId: 102, statut: 'en_selection', spectateur: { prenom: 'Zoé', nom: 'D', email: 'zoe@x.ca' } },
    ],
  };

  it('compte les sièges vendus, en sélection et libres, et la recette', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    const ventes = await getVentesEvenement(1, 7);

    expect(ventes.totaux).toEqual({ total: 4, vendus: 2, enSelection: 1, libres: 1 });
    expect(ventes.recette).toBe(50);
    expect(ventes.evenement).toEqual({ id: 1, titre: 'Concert', dateHeure: evenement.dateHeure, tarif: 25 });
    expect(ventes.salle).toEqual({ id: 19, nom: 'Salle A' });
  });

  it("donne l'état de chaque siège, trié par rangée puis colonne", async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    const { sieges } = await getVentesEvenement(1, 7);

    expect(sieges.map(({ id, rangee, colonne, etat }) => ({ id, rangee, colonne, etat }))).toEqual([
      { id: 101, rangee: 1, colonne: 1, etat: 'vendu' },
      { id: 102, rangee: 1, colonne: 2, etat: 'en_selection' },
      { id: 103, rangee: 1, colonne: 3, etat: 'vendu' },
      { id: 104, rangee: 2, colonne: 1, etat: 'libre' },
    ]);
  });

  it("joint la réservation et le spectateur de chaque siège occupé, pour l'annulation (#14)", async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    const { sieges } = await getVentesEvenement(1, 7);

    expect(sieges.find((s) => s.id === 101).reservation).toEqual({
      id: 1,
      spectateur: { prenom: 'Ana', nom: 'B', email: 'ana@x.ca' },
    });
    expect(sieges.find((s) => s.id === 104).reservation).toBeUndefined();
  });

  it('ignore les sélections expirées (seules les confirmées et les sélections en cours sont chargées)', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    await getVentesEvenement(1, 7);

    const { reservations } = prisma.evenement.findUnique.mock.calls[0][0].include;
    expect(reservations.where).toEqual({
      OR: [
        { statut: 'confirmee' },
        { statut: 'en_selection', delaiExpiration: { gt: expect.any(Date) } },
      ],
    });
  });

  it('renvoie une recette nulle pour un événement sans tarif', async () => {
    prisma.evenement.findUnique.mockResolvedValue({ ...evenement, tarif: null });

    const ventes = await getVentesEvenement(1, 7);

    expect(ventes.recette).toBeNull();
    expect(ventes.evenement.tarif).toBeNull();
  });

  it("refuse (404) si l'événement n'existe pas", async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    await expect(getVentesEvenement(999, 7)).rejects.toMatchObject({ status: 404 });
  });

  it("refuse (403) l'événement d'un autre organisateur", async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    await expect(getVentesEvenement(1, 8)).rejects.toMatchObject({ status: 403 });
  });
});

describe('prix par section (#11)', () => {
  const balcon = { id: 10, nom: 'Balcon', prix: '40.00', couleur: '#f59e0b' };
  const evenement = {
    id: 1,
    organisateurId: 7,
    titre: 'Concert',
    dateHeure: new Date('2099-11-05T19:00:00Z'),
    tarif: '25.00',
    salle: {
      id: 19,
      nom: 'Salle A',
      sections: [balcon],
      sieges: [
        { id: 101, numeroRangee: 1, numeroColonne: 1, sectionId: 10, section: balcon },
        { id: 102, numeroRangee: 1, numeroColonne: 2, sectionId: null, section: null },
        { id: 103, numeroRangee: 1, numeroColonne: 3, sectionId: 10, section: balcon },
      ],
    },
    reservations: [
      { id: 1, siegeId: 101, statut: 'confirmee', spectateur: { prenom: 'A', nom: 'B', email: 'a@b.c' } },
      { id: 2, siegeId: 102, statut: 'confirmee', spectateur: { prenom: 'C', nom: 'D', email: 'c@d.e' } },
    ],
  };

  it("le plan donne le prix de chaque siège : sa section, sinon le tarif de l'événement", async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    const plan = await getPlanSalle(1);

    expect(plan.sections).toEqual([{ id: 10, nom: 'Balcon', prix: 40, couleur: '#f59e0b' }]);
    expect(plan.sieges.map((s) => [s.id, s.sectionId, s.prix])).toEqual([
      [101, 10, 40],
      [102, null, 25],
      [103, 10, 40],
    ]);
  });

  it('la recette additionne le prix de chaque place vendue', async () => {
    prisma.evenement.findUnique.mockResolvedValue(evenement);

    const ventes = await getVentesEvenement(1, 7);

    expect(ventes.recette).toBe(65); // 40 (balcon) + 25 (tarif de l'événement)
    expect(ventes.sections).toEqual([{ id: 10, nom: 'Balcon', prix: 40, couleur: '#f59e0b' }]);
  });

  it("calcule la recette des sections même si l'événement n'a pas de tarif", async () => {
    prisma.evenement.findUnique.mockResolvedValue({ ...evenement, tarif: null, reservations: [evenement.reservations[0]] });

    const ventes = await getVentesEvenement(1, 7);

    expect(ventes.recette).toBe(40);
  });
});

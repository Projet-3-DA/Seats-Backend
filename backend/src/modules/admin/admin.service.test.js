jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getEvenements, getEvenement } = require('./admin.service');

const JOUR = 86_400_000;

function evenementBrut(id, decalageJours, overrides = {}) {
  return {
    id,
    titre: `Événement ${id}`,
    organisateurId: 7,
    dateHeure: new Date(Date.now() + decalageJours * JOUR),
    salle: { id: 3, nom: 'Salle A', _count: { sieges: 20 } },
    organisateur: { id: 7, prenom: 'Org', nom: 'Anisateur', email: 'org@test.local' },
    _count: { reservations: 4 },
    ...overrides,
  };
}

describe('getEvenements (#36)', () => {
  it("liste tous les événements, quel que soit l'organisateur et y compris les passés", async () => {
    prisma.evenement.findMany.mockResolvedValue([]);

    await getEvenements();

    const args = prisma.evenement.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
    expect(args.include.organisateur).toEqual({ select: { id: true, prenom: true, nom: true, email: true } });
    expect(args.include._count).toEqual({ select: { reservations: { where: { statut: 'confirmee' } } } });
  });

  it("ajoute l'organisateur, les sièges vendus sur le total et l'indicateur « terminé »", async () => {
    prisma.evenement.findMany.mockResolvedValue([evenementBrut(1, 2)]);

    const [evenement] = await getEvenements();

    expect(evenement).toEqual({
      id: 1,
      titre: 'Événement 1',
      organisateurId: 7,
      dateHeure: expect.any(Date),
      salle: { id: 3, nom: 'Salle A' },
      organisateur: { id: 7, prenom: 'Org', nom: 'Anisateur', email: 'org@test.local' },
      vendus: 4,
      totalSieges: 20,
      terminee: false,
    });
  });

  it("met les événements à venir d'abord (du plus proche), puis les passés (du plus récent)", async () => {
    // findMany les renvoie triés par date croissante.
    prisma.evenement.findMany.mockResolvedValue([
      evenementBrut(1, -10),
      evenementBrut(2, -1),
      evenementBrut(3, 1),
      evenementBrut(4, 5),
    ]);

    const liste = await getEvenements();

    expect(liste.map((e) => e.id)).toEqual([3, 4, 2, 1]);
    expect(liste.map((e) => e.terminee)).toEqual([false, false, true, true]);
  });
});

describe('getEvenement (#36)', () => {
  const organisateur = { id: 7, prenom: 'Org', nom: 'Anisateur', email: 'org@test.local' };

  function avecVentes(overrides = {}) {
    return {
      id: 1,
      organisateurId: 7,
      titre: 'Concert',
      description: 'Une soirée',
      afficheUrl: 'https://exemple.com/a.png',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      dateHeure: new Date(Date.now() + JOUR),
      tarif: '10.00',
      organisateur,
      salle: {
        id: 3,
        nom: 'Salle A',
        sieges: [
          { id: 11, numeroRangee: 1, numeroColonne: 1 },
          { id: 12, numeroRangee: 1, numeroColonne: 2 },
        ],
        // Salle au tarif unique de l'événement : pas de sections tarifaires (#11).
        sections: [],
      },
      reservations: [
        { id: 50, siegeId: 11, statut: 'confirmee', spectateur: { prenom: 'S', nom: 'P', email: 's@test.local' } },
      ],
      ...overrides,
    };
  }

  it("renvoie le détail et les ventes de n'importe quel événement, sans vérifier l'organisateur", async () => {
    prisma.evenement.findUnique.mockResolvedValue(avecVentes());

    const detail = await getEvenement(1);

    expect(prisma.evenement.findUnique.mock.calls[0][0].include.organisateur).toEqual({
      select: { id: true, prenom: true, nom: true, email: true },
    });
    expect(detail.evenement).toEqual({
      id: 1,
      titre: 'Concert',
      dateHeure: expect.any(Date),
      tarif: 10,
      description: 'Une soirée',
      afficheUrl: 'https://exemple.com/a.png',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      terminee: false,
    });
    expect(detail.organisateur).toEqual(organisateur);
    expect(detail.totaux).toEqual({ total: 2, vendus: 1, enSelection: 0, libres: 1 });
    expect(detail.recette).toBe(10);
    expect(detail.sieges[0]).toMatchObject({ id: 11, etat: 'vendu', reservation: { id: 50 } });
  });

  it('indique un événement passé comme terminé', async () => {
    prisma.evenement.findUnique.mockResolvedValue(avecVentes({ dateHeure: new Date(Date.now() - JOUR) }));

    const detail = await getEvenement(1);

    expect(detail.evenement.terminee).toBe(true);
  });

  it("refuse (404) un événement qui n'existe pas", async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    await expect(getEvenement(999)).rejects.toMatchObject({ status: 404 });
  });
});

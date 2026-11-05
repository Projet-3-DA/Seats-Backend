jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const {
  getEvenements,
  getEvenement,
  getOrganisateurs,
  getOrganisateur,
  getComptes,
  changerStatutCompte,
} = require('./admin.service');

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

describe('getOrganisateurs (#15)', () => {
  it('ne liste que les organisateurs, par ordre alphabétique, sans mot de passe', async () => {
    prisma.utilisateur.findMany.mockResolvedValue([]);

    await getOrganisateurs();

    const args = prisma.utilisateur.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ role: 'organisateur' });
    expect(args.orderBy).toEqual([{ nom: 'asc' }, { prenom: 'asc' }]);
    expect(args.select.motDePasse).toBeUndefined();
    expect(args.select._count).toEqual({ select: { evenements: true, salles: true } });
  });

  it("renvoie le nom, le courriel, le nombre d'événements et de salles de chacun", async () => {
    const inscription = new Date('2026-09-01T00:00:00Z');
    prisma.utilisateur.findMany.mockResolvedValue([
      { id: 7, prenom: 'Olivia', nom: 'Organisatrice', email: 'o@test.local', createdAt: inscription, _count: { evenements: 3, salles: 1 } },
    ]);

    await expect(getOrganisateurs()).resolves.toEqual([
      { id: 7, prenom: 'Olivia', nom: 'Organisatrice', email: 'o@test.local', createdAt: inscription, nombreEvenements: 3, nombreSalles: 1 },
    ]);
  });
});

describe('getOrganisateur (#15)', () => {
  function organisateurBrut(evenements = []) {
    return {
      id: 7,
      prenom: 'Olivia',
      nom: 'Organisatrice',
      email: 'o@test.local',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      _count: { evenements: evenements.length, salles: 1 },
      salles: [{ id: 3, nom: 'Salle A', nombreRangees: 5, siegesParRangee: 8 }],
      evenements,
    };
  }

  const evenement = (id, decalageJours) => ({
    id,
    titre: `Événement ${id}`,
    dateHeure: new Date(Date.now() + decalageJours * JOUR),
    salle: { id: 3, nom: 'Salle A' },
  });

  it("cherche un organisateur par son id, jamais un compte d'un autre rôle", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue(organisateurBrut());

    await getOrganisateur(7);

    const args = prisma.utilisateur.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 7, role: 'organisateur' });
    expect(args.select.motDePasse).toBeUndefined();
  });

  it('renvoie ses salles et ses événements, à venir d\'abord puis passés', async () => {
    // findFirst renvoie les événements triés par date croissante.
    prisma.utilisateur.findFirst.mockResolvedValue(
      organisateurBrut([evenement(1, -10), evenement(2, -1), evenement(3, 1), evenement(4, 5)]),
    );

    const detail = await getOrganisateur(7);

    expect(detail).toMatchObject({ id: 7, email: 'o@test.local', nombreEvenements: 4, nombreSalles: 1 });
    expect(detail._count).toBeUndefined();
    expect(detail.salles).toEqual([{ id: 3, nom: 'Salle A', nombreRangees: 5, siegesParRangee: 8 }]);
    expect(detail.evenements.map((e) => e.id)).toEqual([3, 4, 2, 1]);
    expect(detail.evenements.map((e) => e.terminee)).toEqual([false, false, true, true]);
  });

  it("refuse (404) un id qui n'est pas celui d'un organisateur", async () => {
    prisma.utilisateur.findFirst.mockResolvedValue(null);

    await expect(getOrganisateur(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('getComptes (#20)', () => {
  it('liste les organisateurs et les spectateurs avec leur statut, sans mot de passe', async () => {
    prisma.utilisateur.findMany.mockResolvedValue([]);

    await getComptes();

    const args = prisma.utilisateur.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ role: { in: ['organisateur', 'spectateur'] } });
    expect(args.orderBy).toEqual([{ nom: 'asc' }, { prenom: 'asc' }]);
    expect(args.select).toMatchObject({ statut: true, raisonSuspension: true, suspenduLe: true, role: true });
    expect(args.select.motDePasse).toBeUndefined();
  });
});

describe('changerStatutCompte (#20)', () => {
  beforeEach(() => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 5, role: 'spectateur' });
    prisma.utilisateur.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
  });

  it('suspend le compte et enregistre la raison et la date, sans le supprimer', async () => {
    const compte = await changerStatutCompte(5, { statut: 'suspendu', raison: '  Revente de billets  ' });

    const { where, data } = prisma.utilisateur.update.mock.calls[0][0];
    expect(where).toEqual({ id: 5 });
    expect(data).toEqual({ statut: 'suspendu', raisonSuspension: 'Revente de billets', suspenduLe: expect.any(Date) });
    expect(compte.statut).toBe('suspendu');
  });

  it('accepte une suspension sans raison', async () => {
    await changerStatutCompte(5, { statut: 'suspendu' });

    expect(prisma.utilisateur.update.mock.calls[0][0].data.raisonSuspension).toBeNull();
  });

  it('réactive le compte et efface la raison', async () => {
    await changerStatutCompte(5, { statut: 'actif' });

    expect(prisma.utilisateur.update.mock.calls[0][0].data).toEqual({
      statut: 'actif',
      raisonSuspension: null,
      suspenduLe: null,
    });
  });

  it('suspend aussi un organisateur', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 5, role: 'organisateur' });

    await expect(changerStatutCompte(5, { statut: 'suspendu' })).resolves.toMatchObject({ statut: 'suspendu' });
  });

  it.each([undefined, 'banni', ''])('refuse le statut %p (400)', async (statut) => {
    await expect(changerStatutCompte(5, { statut })).rejects.toMatchObject({ status: 400 });
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });

  it("refuse une raison qui n'est pas un texte (400)", async () => {
    await expect(changerStatutCompte(5, { statut: 'suspendu', raison: 42 })).rejects.toMatchObject({ status: 400 });
  });

  it('refuse une raison de plus de 500 caractères (400)', async () => {
    await expect(changerStatutCompte(5, { statut: 'suspendu', raison: 'x'.repeat(501) })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });

  it('renvoie 404 si le compte est introuvable', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(null);

    await expect(changerStatutCompte(999, { statut: 'suspendu' })).rejects.toMatchObject({ status: 404 });
  });

  it('refuse de suspendre un compte administrateur (403)', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 1, role: 'administrateur' });

    await expect(changerStatutCompte(1, { statut: 'suspendu' })).rejects.toMatchObject({ status: 403 });
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });
});

jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllSalles, createSalle, updateSalle, remplacerSections, getSalleById } = require('./salles.service');

// "rejette une salle sans aucun siège" est déjà couvert dans salles.validation.test.js
// (nombreRangees/siegesParRangee > 0), avant que le service soit appelé.
it.todo("l'unicité (organisateurId, nom) est une contrainte DB (@@unique) : pas testable avec Prisma simulé (#2)");

describe('getAllSalles', () => {
  it('liste les salles avec leurs sièges', async () => {
    const rows = [{ id: 1, nom: 'Salle A', sieges: [] }];
    prisma.salle.findMany.mockResolvedValue(rows);

    await expect(getAllSalles(1)).resolves.toEqual(rows);
    expect(prisma.salle.findMany).toHaveBeenCalledWith({ where: { organisateurId: 1 }, include: { sieges: true, _count: { select: { evenements: true } } } });
  });

  it("ne retourne que les salles de l'organisateur courant (#25)", async () => {
    prisma.salle.findMany.mockResolvedValue([]);

    await getAllSalles(42);

    expect(prisma.salle.findMany).toHaveBeenCalledWith({ where: { organisateurId: 42 }, include: { sieges: true, _count: { select: { evenements: true } } } });
  });
});

describe('createSalle', () => {
  it('crée la salle et génère individuellement chaque siège (rangée + colonne)', async () => {
    const data = { organisateurId: 1, nom: 'Salle A', nombreRangees: 2, siegesParRangee: 3 };
    prisma.salle.create.mockResolvedValue({ id: 1, ...data });
    const salleAvecSieges = { id: 1, ...data, sieges: new Array(6).fill({}) };
    prisma.salle.findUnique.mockResolvedValue(salleAvecSieges);

    await expect(createSalle(data)).resolves.toEqual(salleAvecSieges);

    expect(prisma.salle.create).toHaveBeenCalledWith({ data });
    // 2 rangées x 3 sièges par rangée = 6 sièges, numérotés à partir de 1
    const sieges = prisma.siege.createMany.mock.calls[0][0].data;
    expect(sieges).toHaveLength(6);
    expect(sieges[0]).toEqual({ salleId: 1, numeroRangee: 1, numeroColonne: 1 });
    expect(sieges[5]).toEqual({ salleId: 1, numeroRangee: 2, numeroColonne: 3 });
    expect(prisma.salle.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, include: { sieges: true } });
  });
});

describe('updateSalle (#10)', () => {
  const modif = { organisateurId: 1, nom: 'Salle B', nombreRangees: 2, siegesParRangee: 2 };

  it("modifie nom et disposition et regénère les sièges d'une salle sans événement", async () => {
    prisma.salle.findFirst.mockResolvedValue({ id: 3, _count: { evenements: 0 } });
    prisma.salle.findUnique.mockResolvedValue({ id: 3, nom: 'Salle B', sieges: [] });

    await expect(updateSalle(3, modif)).resolves.toEqual({ id: 3, nom: 'Salle B', sieges: [] });

    expect(prisma.salle.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3, organisateurId: 1 } }));
    expect(prisma.salle.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { nom: 'Salle B', nombreRangees: 2, siegesParRangee: 2 },
    });
    expect(prisma.siege.deleteMany).toHaveBeenCalledWith({ where: { salleId: 3 } });
    expect(prisma.siege.createMany.mock.calls[0][0].data).toEqual([
      { salleId: 3, numeroRangee: 1, numeroColonne: 1 },
      { salleId: 3, numeroRangee: 1, numeroColonne: 2 },
      { salleId: 3, numeroRangee: 2, numeroColonne: 1 },
      { salleId: 3, numeroRangee: 2, numeroColonne: 2 },
    ]);
  });

  it("refuse la modification si la salle est déjà utilisée par un événement (409)", async () => {
    prisma.salle.findFirst.mockResolvedValue({ id: 3, _count: { evenements: 1 } });

    await expect(updateSalle(3, modif)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/utilisée par un événement/) });
    expect(prisma.salle.update).not.toHaveBeenCalled();
    expect(prisma.siege.deleteMany).not.toHaveBeenCalled();
  });

  it("répond 404 pour une salle inexistante ou appartenant à un autre organisateur", async () => {
    prisma.salle.findFirst.mockResolvedValue(null);

    await expect(updateSalle(3, modif)).rejects.toMatchObject({ status: 404 });
    expect(prisma.salle.update).not.toHaveBeenCalled();
  });
});

describe('remplacerSections (#11)', () => {
  const salle = { id: 3, sieges: [{ id: 1 }, { id: 2 }, { id: 3 }], _count: { evenements: 0 } };
  const sections = [
    { nom: ' Parterre ', prix: 45, couleur: '#2563eb', siegeIds: [1, 2] },
    { nom: 'Balcon', prix: 25, couleur: '#f59e0b', siegeIds: [3] },
  ];

  it('remplace les sections et assigne chaque groupe de sièges à sa section', async () => {
    prisma.salle.findFirst.mockResolvedValue(salle);
    prisma.section.create.mockResolvedValueOnce({ id: 10 }).mockResolvedValueOnce({ id: 11 });
    prisma.salle.findUnique.mockResolvedValue({
      id: 3,
      sieges: [],
      sections: [{ id: 10, nom: 'Parterre', prix: '45.00', couleur: '#2563eb' }],
    });

    const resultat = await remplacerSections(3, { organisateurId: 7, sections });

    expect(prisma.salle.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3, organisateurId: 7 } }));
    // Les anciennes sections sont retirées avant de créer les nouvelles
    expect(prisma.siege.updateMany).toHaveBeenNthCalledWith(1, { where: { salleId: 3 }, data: { sectionId: null } });
    expect(prisma.section.deleteMany).toHaveBeenCalledWith({ where: { salleId: 3 } });
    expect(prisma.section.create).toHaveBeenNthCalledWith(1, {
      data: { salleId: 3, nom: 'Parterre', prix: 45, couleur: '#2563eb' },
    });
    expect(prisma.siege.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [1, 2] }, salleId: 3 },
      data: { sectionId: 10 },
    });
    expect(prisma.siege.updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: { in: [3] }, salleId: 3 },
      data: { sectionId: 11 },
    });
    expect(resultat.sections).toEqual([{ id: 10, nom: 'Parterre', prix: 45, couleur: '#2563eb' }]);
  });

  it('retire toutes les sections avec une liste vide', async () => {
    prisma.salle.findFirst.mockResolvedValue(salle);
    prisma.salle.findUnique.mockResolvedValue({ id: 3, sieges: [], sections: [] });

    await remplacerSections(3, { organisateurId: 7, sections: [] });

    expect(prisma.section.deleteMany).toHaveBeenCalled();
    expect(prisma.section.create).not.toHaveBeenCalled();
  });

  it("refuse (404) la salle d'un autre organisateur ou inexistante", async () => {
    prisma.salle.findFirst.mockResolvedValue(null);

    await expect(remplacerSections(3, { organisateurId: 8, sections })).rejects.toMatchObject({ status: 404 });
    expect(prisma.section.deleteMany).not.toHaveBeenCalled();
  });

  it('refuse (409) une salle déjà utilisée par un événement, comme la modification (#10)', async () => {
    prisma.salle.findFirst.mockResolvedValue({ ...salle, _count: { evenements: 1 } });

    await expect(remplacerSections(3, { organisateurId: 7, sections })).rejects.toMatchObject({ status: 409 });
    expect(prisma.section.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse (400) un siège qui n'appartient pas à la salle", async () => {
    prisma.salle.findFirst.mockResolvedValue(salle);

    await expect(
      remplacerSections(3, { organisateurId: 7, sections: [{ ...sections[0], siegeIds: [1, 99] }] }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/99/) });
    expect(prisma.section.deleteMany).not.toHaveBeenCalled();
  });
});

describe('getSalleById avec sections (#11)', () => {
  it('renvoie les sections avec un prix numérique et le nombre d\'événements', async () => {
    prisma.salle.findUnique.mockResolvedValue({
      id: 3,
      sieges: [{ id: 1, sectionId: 10 }],
      sections: [{ id: 10, salleId: 3, nom: 'Balcon', prix: '30.00', couleur: '#f59e0b' }],
      _count: { evenements: 0 },
    });

    const salle = await getSalleById(3);

    expect(salle.sections).toEqual([{ id: 10, nom: 'Balcon', prix: 30, couleur: '#f59e0b' }]);
    expect(prisma.salle.findUnique).toHaveBeenCalledWith({
      where: { id: 3 },
      include: { sieges: true, sections: true, _count: { select: { evenements: true } } },
    });
  });

  it('renvoie null pour une salle inexistante', async () => {
    prisma.salle.findUnique.mockResolvedValue(null);
    await expect(getSalleById(999)).resolves.toBeNull();
  });
});

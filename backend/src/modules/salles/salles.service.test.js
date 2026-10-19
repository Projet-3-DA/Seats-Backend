jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllSalles, createSalle, updateSalle } = require('./salles.service');

// "rejette une salle sans aucun siège" est déjà couvert dans salles.validation.test.js
// (nombreRangees/siegesParRangee > 0), avant que le service soit appelé.
it.todo("l'unicité (organisateurId, nom) est une contrainte DB (@@unique) : pas testable avec Prisma simulé (#2)");
it.todo('assignerSection() assigne un groupe de sièges à une section nommée avec un prix (#11)');

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

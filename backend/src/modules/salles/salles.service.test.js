jest.mock('../../lib/prisma');

const prisma = require('../../lib/prisma');
const { getAllSalles, createSalle } = require('./salles.service');

// "rejette une salle sans aucun siège" est déjà couvert dans salles.validation.test.js
// (nombreRangees/siegesParRangee > 0), avant que le service soit appelé.
it.todo("l'unicité (organisateurId, nom) est une contrainte DB (@@unique) : pas testable avec Prisma simulé (#2)");
it.todo("updateSalle() modifie une salle tant qu'aucun événement ne l'utilise (#10)");
it.todo("updateSalle() refuse la modification si la salle est déjà utilisée par un événement (#10)");
it.todo('assignerSection() assigne un groupe de sièges à une section nommée avec un prix (#11)');

describe('getAllSalles', () => {
  it('liste les salles avec leurs sièges', async () => {
    const rows = [{ id: 1, nom: 'Salle A', sieges: [] }];
    prisma.salle.findMany.mockResolvedValue(rows);

    await expect(getAllSalles(1)).resolves.toEqual(rows);
    expect(prisma.salle.findMany).toHaveBeenCalledWith({ where: { organisateurId: 1 }, include: { sieges: true } });
  });

  it("ne retourne que les salles de l'organisateur courant (#25)", async () => {
    prisma.salle.findMany.mockResolvedValue([]);

    await getAllSalles(42);

    expect(prisma.salle.findMany).toHaveBeenCalledWith({ where: { organisateurId: 42 }, include: { sieges: true } });
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

const prisma = require('../../lib/prisma');
const httpError = require('../../lib/http-error');
const { formatSection } = require('../../lib/prix');

async function getAllSalles(organisateurId) {
  return await prisma.salle.findMany({ where: { organisateurId }, include: { sieges: true, _count: { select: { evenements: true } } } });
}

function buildSiegesData(salleId, nombreRangees, siegesParRangee) {
  const sieges = [];
  for (let rangee = 1; rangee <= nombreRangees; rangee++) {
    for (let colonne = 1; colonne <= siegesParRangee; colonne++) {
      sieges.push({ salleId, numeroRangee: rangee, numeroColonne: colonne });
    }
  }
  return sieges;
}

// Crée la salle et ses sièges dans une seule transaction
async function createSalle({ organisateurId, nom, nombreRangees, siegesParRangee }) {
  return await prisma.$transaction(async (tx) => {
    const salle = await tx.salle.create({
      data: { organisateurId, nom, nombreRangees, siegesParRangee },
    });
    await tx.siege.createMany({
      data: buildSiegesData(salle.id, nombreRangees, siegesParRangee),
    });
    return await tx.salle.findUnique({
      where: { id: salle.id },
      include: { sieges: true },
    });
  });
}
// Modifie nom et disposition (#10). Les sièges sont regénérés : sans événement, aucune réservation ne
// les référence. Vérification et écriture dans la même transaction.
async function updateSalle(id, { organisateurId, nom, nombreRangees, siegesParRangee }) {
  return await prisma.$transaction(async (tx) => {
    // Filtrer par organisateurId : la salle d'un autre organisateur répond 404, comme si elle n'existait pas.
    const salle = await tx.salle.findFirst({
      where: { id, organisateurId },
      include: { _count: { select: { evenements: true } } },
    });
    if (!salle) throw httpError(404, 'Salle introuvable');
    if (salle._count.evenements > 0) {
      throw httpError(409, 'Cette salle est déjà utilisée par un événement : elle ne peut plus être modifiée.');
    }
    await tx.salle.update({ where: { id }, data: { nom, nombreRangees, siegesParRangee } });
    await tx.siege.deleteMany({ where: { salleId: id } });
    await tx.siege.createMany({ data: buildSiegesData(id, nombreRangees, siegesParRangee) });
    return await tx.salle.findUnique({ where: { id }, include: { sieges: true } });
  });
}

async function getSalleById(id) {
  const salle = await prisma.salle.findUnique({
    where: { id },
    include: { sieges: true, sections: true, _count: { select: { evenements: true } } },
  });
  return salle && { ...salle, sections: salle.sections.map(formatSection) };
}

// Remplace toutes les sections tarifaires de la salle (#11). Mêmes règles que la modification de la
// salle (#10) : seulement tant qu'aucun événement ne l'utilise, pour que le prix d'une place déjà
// vendue ne change jamais. Vérification et écriture dans la même transaction.
async function remplacerSections(salleId, { organisateurId, sections }) {
  return await prisma.$transaction(async (tx) => {
    // Filtrer par organisateurId : la salle d'un autre organisateur répond 404, comme si elle n'existait pas.
    const salle = await tx.salle.findFirst({
      where: { id: salleId, organisateurId },
      include: { sieges: { select: { id: true } }, _count: { select: { evenements: true } } },
    });
    if (!salle) throw httpError(404, 'Salle introuvable');
    if (salle._count.evenements > 0) {
      throw httpError(409, 'Cette salle est déjà utilisée par un événement : ses sections ne peuvent plus être modifiées.');
    }
    const siegesDeLaSalle = new Set(salle.sieges.map((s) => s.id));
    const inconnus = sections.flatMap((s) => s.siegeIds).filter((id) => !siegesDeLaSalle.has(id));
    if (inconnus.length > 0) {
      throw httpError(400, `Ces sièges n'appartiennent pas à la salle : ${inconnus.join(', ')}.`);
    }

    await tx.siege.updateMany({ where: { salleId }, data: { sectionId: null } });
    await tx.section.deleteMany({ where: { salleId } });
    for (const section of sections) {
      const creee = await tx.section.create({
        data: { salleId, nom: section.nom.trim(), prix: section.prix, couleur: section.couleur },
      });
      await tx.siege.updateMany({ where: { id: { in: section.siegeIds }, salleId }, data: { sectionId: creee.id } });
    }

    const resultat = await tx.salle.findUnique({ where: { id: salleId }, include: { sieges: true, sections: true } });
    return { ...resultat, sections: resultat.sections.map(formatSection) };
  });
}

module.exports = {
  getAllSalles,
  getSalleById,
  createSalle,
  updateSalle,
  remplacerSections,
};
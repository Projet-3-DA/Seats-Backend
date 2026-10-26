// Prix d'un siège pour un événement (#11) : celui de sa section s'il en a une, sinon le tarif unique de
// l'événement. null si aucun des deux n'est connu (ancien événement créé avant l'ajout du tarif).
// Prisma renvoie les Decimal comme des objets : ils sont convertis en nombre pour le JSON et les calculs.
function prixSiege(siege, tarifEvenement) {
  if (siege.section) return Number(siege.section.prix);
  return tarifEvenement === null || tarifEvenement === undefined ? null : Number(tarifEvenement);
}

// Section telle qu'exposée par l'API : prix converti en nombre.
function formatSection(section) {
  return { id: section.id, nom: section.nom, prix: Number(section.prix), couleur: section.couleur };
}

module.exports = { prixSiege, formatSection };

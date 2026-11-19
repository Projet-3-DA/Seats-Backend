const httpError = require('./http-error');

// Un compte suspendu par un administrateur (#20) ne peut plus se connecter (#41), quelle que soit la
// méthode : mot de passe, GitHub, Google ou Microsoft. La raison de la suspension reste interne.
const MESSAGE_COMPTE_SUSPENDU =
  "Ce compte est suspendu. Contactez l'administrateur de la plateforme si vous pensez qu'il s'agit d'une erreur.";

function verifierCompteActif(utilisateur) {
  if (utilisateur?.statut === 'suspendu') throw httpError(403, MESSAGE_COMPTE_SUSPENDU);
}

// Règle de visibilité (#41, voir 03-conception.md) : les événements et les salles d'un organisateur
// suspendu sont masqués aux spectateurs et aux visiteurs. Ils restent en base, et visibles par
// l'administrateur dans la supervision.
function organisateurSuspendu(organisateur) {
  return organisateur?.statut === 'suspendu';
}

module.exports = { MESSAGE_COMPTE_SUSPENDU, verifierCompteActif, organisateurSuspendu };

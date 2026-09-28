// Comptes de démonstration (un par rôle), créés au démarrage du conteneur. Idempotent : un compte
// existant est laissé tel quel, donc un redémarrage ne réinitialise ni ses données ni son mot de passe.
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const SALT_ROUNDS = 10;
const MOT_DE_PASSE_DEMO = 'Demo1234!';

const COMPTES_DEMO = [
  { email: 'spectateur@seats.demo', prenom: 'Sam', nom: 'Spectateur', role: 'spectateur' },
  { email: 'organisateur@seats.demo', prenom: 'Olivia', nom: 'Organisatrice', role: 'organisateur' },
  { email: 'admin@seats.demo', prenom: 'Alex', nom: 'Admin', role: 'administrateur' },
];

async function creerComptesDemo() {
  const motDePasse = await bcrypt.hash(MOT_DE_PASSE_DEMO, SALT_ROUNDS);
  for (const compte of COMPTES_DEMO) {
    await prisma.utilisateur.upsert({
      where: { email: compte.email },
      update: {},
      create: { ...compte, motDePasse },
    });
  }
}

module.exports = { COMPTES_DEMO, MOT_DE_PASSE_DEMO, creerComptesDemo };

if (require.main === module) {
  creerComptesDemo()
    .then(() => {
      console.log(`Comptes de démonstration prêts : ${COMPTES_DEMO.map((c) => c.email).join(', ')}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Échec de la création des comptes de démonstration :', error);
      process.exit(1);
    });
}

const app = require('./app');
const env = require('./config/env');
const evenementsService = require('./modules/evenements/evenements.service');

const server = app.listen(env.port, () => {
  console.log(`Serveur Seats backend en écoute sur le port ${env.port}`);
});

require('./realtime').init(server, { verifierProprietaireEvenement: evenementsService.getOrganisateurId });
const app = require('./app');
const env = require('./config/env');

const server = app.listen(env.port, () => {
  console.log(`Serveur Seats backend en écoute sur le port ${env.port}`);
});
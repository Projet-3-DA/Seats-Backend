const app = require('./app');
const PORT = process.env.PORT || 3000;

// Démarrage du serveur HTTP
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
const express = require('express');
const routes = require('./routes');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

app.use(express.json());

// CORS minimal pour le dev (frontend web servi sur un autre port).
// origin ouverte à tous, à restreindre à un domaine précis en prod.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Routes de l'API
app.use('/api', routes);

// Route d'état (Health check)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'API Seats backend opérationnelle' });
});

// Middleware d'erreur global
app.use(errorMiddleware);

module.exports = app;
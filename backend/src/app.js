const express = require('express');
const routes = require('./routes');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

app.use(express.json());

// Routes de l'API
app.use('/api', routes);

// Route d'état (Health check)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'API Seats backend opérationnelle' });
});

// Middleware d'erreur global
app.use(errorMiddleware);

module.exports = app;
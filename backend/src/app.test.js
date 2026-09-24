// Prisma est toujours simulé dans ces tests d'intégration : app.js charge toutes les routes (donc tous
// les services) au démarrage, et on ne veut ni vraie base de données, ni vrais identifiants Supabase.
jest.mock('./lib/prisma');

const request = require('supertest');
const app = require('./app');

describe('GET /', () => {
  it('renvoie l\'état de santé de l\'API', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', message: expect.any(String) });
  });
});

describe('CORS', () => {
  it('autorise les requêtes cross-origin', async () => {
    const res = await request(app).get('/').set('Origin', 'http://localhost:8081');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});

describe('routes inconnues', () => {
  it('renvoie 404 pour une route qui n\'existe pas', async () => {
    const res = await request(app).get('/api/route-inexistante');
    expect(res.status).toBe(404);
  });
});

// Couverture volontairement légère : register/login sont marqués TODO dans le code (pas de hachage de
// mot de passe, pas de JWT). Ces tests protègent le câblage des routes, pas une logique de sécurité
// qui n'existe pas encore.
jest.mock('../../lib/prisma');

const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');

describe('POST /api/auth/register', () => {
  it('crée l\'utilisateur et renvoie 201', async () => {
    const utilisateur = { id: 1, email: 'a@exemple.com', nom: 'Dupont', prenom: 'Jean', role: 'spectateur' };
    prisma.utilisateur.create.mockResolvedValue(utilisateur);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@exemple.com', motDePasse: 'secret', nom: 'Dupont', prenom: 'Jean', role: 'spectateur' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: utilisateur });
  });

  it('renvoie 500 si l\'email existe déjà (contrainte non traduite pour l\'instant)', async () => {
    prisma.utilisateur.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));

    const res = await request(app).post('/api/auth/register').send({ email: 'a@exemple.com' });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
  it('renvoie l\'utilisateur trouvé par email', async () => {
    const utilisateur = { id: 1, email: 'a@exemple.com', motDePasse: 'secret' };
    prisma.utilisateur.findUnique.mockResolvedValue(utilisateur);

    const res = await request(app).post('/api/auth/login').send({ email: 'a@exemple.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: utilisateur });
  });

  // Documente l'état actuel : aucun mot de passe n'est vérifié (TODO), donc un email inconnu renvoie
  // juste `data: null` en 200 plutôt qu'un 401/404 — à corriger avec la vraie authentification.
  it('renvoie data: null pour un email inconnu, sans vérifier le mot de passe', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send({ email: 'inconnu@exemple.com', password: 'x' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });
});

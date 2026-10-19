jest.mock('../lib/prisma');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const prisma = require('../lib/prisma');
const { jwtSecret } = require('../config/env');

// Requêtes envoyées directement à l'API, sans passer par l'interface (#9) : le rôle est vérifié
// côté serveur à partir du token signé, quelle que soit la requête construite par le client.

const ROLES = ['spectateur', 'organisateur', 'administrateur'];

const ROUTES_PROTEGEES = [
  { methode: 'get', chemin: '/api/salles', autorises: ['organisateur'] },
  { methode: 'post', chemin: '/api/salles', autorises: ['organisateur'] },
  { methode: 'post', chemin: '/api/evenements', autorises: ['organisateur'] },
  { methode: 'get', chemin: '/api/evenements/1/ventes', autorises: ['organisateur'] },
  { methode: 'post', chemin: '/api/evenements/affiche', autorises: ['organisateur'] },
  { methode: 'get', chemin: '/api/reservations', autorises: ['spectateur'] },
  { methode: 'post', chemin: '/api/reservations', autorises: ['spectateur'] },
];

const CAS_INTERDITS = ROUTES_PROTEGEES.flatMap((route) =>
  ROLES.filter((role) => !route.autorises.includes(role)).map((role) => ({ ...route, role })),
);

function jeton(role, secret = jwtSecret, options) {
  return jwt.sign({ userId: 1, role }, secret, options);
}

// Aucune route refusée ne doit atteindre la base de données.
function aucunAppelPrisma() {
  for (const modele of Object.values(prisma)) {
    if (typeof modele !== 'object') continue;
    for (const fn of Object.values(modele)) expect(fn).not.toHaveBeenCalled();
  }
}

describe('accès par rôle vérifié côté serveur (#9)', () => {
  it.each(CAS_INTERDITS)('$methode $chemin refuse le rôle $role (403)', async ({ methode, chemin, role }) => {
    const res = await request(app)[methode](chemin).set('Authorization', `Bearer ${jeton(role)}`).send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, error: expect.stringMatching(/interdit/i) });
    aucunAppelPrisma();
  });

  it.each(ROUTES_PROTEGEES)('$methode $chemin refuse une requête sans token (401)', async ({ methode, chemin }) => {
    const res = await request(app)[methode](chemin).send({});

    expect(res.status).toBe(401);
    aucunAppelPrisma();
  });

  describe('un client ne peut pas se forger un rôle', () => {
    it('refuse un token signé avec une autre clé (401)', async () => {
      const res = await request(app)
        .post('/api/salles')
        .set('Authorization', `Bearer ${jeton('organisateur', 'cle-du-pirate')}`)
        .send({});

      expect(res.status).toBe(401);
      aucunAppelPrisma();
    });

    it("refuse un token dont le rôle a été modifié après signature (401)", async () => {
      const [entete, , signature] = jeton('spectateur').split('.');
      const payloadModifie = Buffer.from(JSON.stringify({ userId: 1, role: 'organisateur' })).toString('base64url');

      const res = await request(app)
        .post('/api/salles')
        .set('Authorization', `Bearer ${entete}.${payloadModifie}.${signature}`)
        .send({});

      expect(res.status).toBe(401);
      aucunAppelPrisma();
    });

    it('refuse un token non signé (alg: none) (401)', async () => {
      const nonSigne = jwt.sign({ userId: 1, role: 'organisateur' }, null, { algorithm: 'none' });

      const res = await request(app).post('/api/salles').set('Authorization', `Bearer ${nonSigne}`).send({});

      expect(res.status).toBe(401);
      aucunAppelPrisma();
    });

    it('refuse un token expiré (401)', async () => {
      const expire = jeton('organisateur', jwtSecret, { expiresIn: -10 });

      const res = await request(app).post('/api/salles').set('Authorization', `Bearer ${expire}`).send({});

      expect(res.status).toBe(401);
      aucunAppelPrisma();
    });

    it('ignore un rôle envoyé dans le corps de la requête (403)', async () => {
      const res = await request(app)
        .post('/api/salles')
        .set('Authorization', `Bearer ${jeton('spectateur')}`)
        .send({ role: 'organisateur', nom: 'Salle', nombreRangees: 1, siegesParRangee: 1 });

      expect(res.status).toBe(403);
      aucunAppelPrisma();
    });
  });
});

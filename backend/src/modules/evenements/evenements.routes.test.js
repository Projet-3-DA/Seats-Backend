const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const storage = require('../../lib/storage');
const httpError = require('../../lib/http-error');

const futur = () => new Date(Date.now() + 7 * 86400_000).toISOString();

function corpsValide(overrides = {}) {
  return {
    organisateurId: 1,
    salleId: 19,
    titre: 'Festival de Jazz',
    description: 'Une soirée jazz',
    dateHeure: futur(),
    tarif: 25,
    ...overrides,
  };
}

test('GET /api/evenements renvoie la liste des événements', async (t) => {
  const liste = [{ id: 1, titre: 'Concert', salle: { id: 19, nom: 'Salle A' } }];
  prisma.evenement.findMany = t.mock.fn(async () => liste);

  const res = await request(app).get('/api/evenements');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, data: liste });
});

test('GET /api/evenements renvoie 500 si la base de données échoue', async (t) => {
  t.mock.method(console, 'error', () => {});
  prisma.evenement.findMany = t.mock.fn(async () => {
    throw new Error('connexion perdue');
  });

  const res = await request(app).get('/api/evenements');

  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
});

test('POST /api/evenements refuse un corps invalide sans toucher à la base (400)', async (t) => {
  const creation = prisma.evenement.create = t.mock.fn(async () => {
    throw new Error('ne devrait pas être appelé');
  });

  const res = await request(app).post('/api/evenements').send(corpsValide({ titre: '' }));

  assert.equal(res.status, 400);
  assert.match(res.body.error, /titre est requis/);
  assert.equal(creation.mock.callCount(), 0);
});

test("POST /api/evenements crée l'événement quand la salle existe et appartient à l'organisateur (201)", async (t) => {
  prisma.salle.findUnique = t.mock.fn(async () => ({ id: 19, organisateurId: 1 }));
  const cree = { id: 1, titre: 'Festival de Jazz', salle: { id: 19, nom: 'Salle A' } };
  const creation = prisma.evenement.create = t.mock.fn(async () => cree);

  const res = await request(app)
    .post('/api/evenements')
    .send(corpsValide({ titre: '  Festival de Jazz  ', description: '  Une soirée jazz  ' }));

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { success: true, data: cree });

  const donneesEnvoyees = creation.mock.calls[0].arguments[0].data;
  assert.equal(donneesEnvoyees.titre, 'Festival de Jazz'); // nettoyé (trim)
  assert.equal(donneesEnvoyees.description, 'Une soirée jazz'); // nettoyé (trim)
  assert.equal(donneesEnvoyees.tarif, 25);
  assert.ok(donneesEnvoyees.dateHeure instanceof Date);
});

test('POST /api/evenements accepte une description et une afficheUrl absentes (null en base)', async (t) => {
  prisma.salle.findUnique = t.mock.fn(async () => ({ id: 19, organisateurId: 1 }));
  const creation = prisma.evenement.create = t.mock.fn(async () => ({ id: 1 }));

  await request(app).post('/api/evenements').send(corpsValide({ description: undefined, afficheUrl: undefined }));

  const donneesEnvoyees = creation.mock.calls[0].arguments[0].data;
  assert.equal(donneesEnvoyees.description, null);
  assert.equal(donneesEnvoyees.afficheUrl, null);
});

test("POST /api/evenements refuse avec 404 si la salle n'existe pas", async (t) => {
  prisma.salle.findUnique = t.mock.fn(async () => null);
  const creation = prisma.evenement.create = t.mock.fn(async () => {
    throw new Error('ne devrait pas être appelé');
  });

  const res = await request(app).post('/api/evenements').send(corpsValide({ salleId: 999 }));

  assert.equal(res.status, 404);
  assert.equal(creation.mock.callCount(), 0);
});

test('POST /api/evenements refuse avec 403 si la salle appartient à un autre organisateur', async (t) => {
  prisma.salle.findUnique = t.mock.fn(async () => ({ id: 19, organisateurId: 2 }));
  const creation = prisma.evenement.create = t.mock.fn(async () => {
    throw new Error('ne devrait pas être appelé');
  });

  const res = await request(app).post('/api/evenements').send(corpsValide({ organisateurId: 1 }));

  assert.equal(res.status, 403);
  assert.equal(creation.mock.callCount(), 0);
});

test('POST /api/evenements traduit une violation de contrainte Prisma (P2003) en 400', async (t) => {
  prisma.salle.findUnique = t.mock.fn(async () => ({ id: 19, organisateurId: 1 }));
  prisma.evenement.create = t.mock.fn(async () => {
    throw Object.assign(new Error('FK violation'), { code: 'P2003' });
  });

  const res = await request(app).post('/api/evenements').send(corpsValide());

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Organisateur introuvable/);
});

test('POST /api/evenements renvoie 500 pour une erreur inattendue de la base', async (t) => {
  t.mock.method(console, 'error', () => {});
  prisma.salle.findUnique = t.mock.fn(async () => ({ id: 19, organisateurId: 1 }));
  prisma.evenement.create = t.mock.fn(async () => {
    throw new Error('boum');
  });

  const res = await request(app).post('/api/evenements').send(corpsValide());

  assert.equal(res.status, 500);
});

test("POST /api/evenements/affiche refuse un Content-Type non accepté (400)", async (t) => {
  const upload = t.mock.method(storage, 'uploadImage', async () => {
    throw new Error('ne devrait pas être appelé');
  });

  const res = await request(app).post('/api/evenements/affiche').set('Content-Type', 'text/plain').send('pas une image');

  assert.equal(res.status, 400);
  assert.equal(upload.mock.callCount(), 0);
});

test('POST /api/evenements/affiche refuse un corps vide (400)', async () => {
  const res = await request(app).post('/api/evenements/affiche').set('Content-Type', 'image/png').send(Buffer.alloc(0));
  assert.equal(res.status, 400);
});

test('POST /api/evenements/affiche refuse une image de plus de 5 Mo (413)', async () => {
  const res = await request(app)
    .post('/api/evenements/affiche')
    .set('Content-Type', 'image/png')
    .send(Buffer.alloc(5 * 1024 * 1024 + 10));

  assert.equal(res.status, 413);
  assert.match(res.body.error, /5 Mo/);
});

test("POST /api/evenements/affiche envoie l'image au stockage et renvoie son URL publique (201)", async (t) => {
  const upload = t.mock.method(
    storage,
    'uploadImage',
    async () => 'https://exemple.supabase.co/storage/v1/object/public/affiches/x.jpg',
  );

  const res = await request(app).post('/api/evenements/affiche').set('Content-Type', 'image/jpeg').send(Buffer.from('donnees-image'));

  assert.equal(res.status, 201);
  assert.match(res.body.data.url, /\/affiches\//);
  assert.equal(upload.mock.calls[0].arguments[1], 'image/jpeg');
});

test('POST /api/evenements/affiche renvoie l\'erreur du service de stockage (ex. 502)', async (t) => {
  t.mock.method(storage, 'uploadImage', async () => {
    throw httpError(502, "Échec de l'envoi de l'image vers le stockage.");
  });

  const res = await request(app).post('/api/evenements/affiche').set('Content-Type', 'image/png').send(Buffer.from('x'));

  assert.equal(res.status, 502);
});

test('GET /api/evenements/:id/plan refuse un id non numérique (400)', async () => {
  const res = await request(app).get('/api/evenements/abc/plan');
  assert.equal(res.status, 400);
});

test("GET /api/evenements/:id/plan renvoie 404 si l'événement n'existe pas", async (t) => {
  prisma.evenement.findUnique = t.mock.fn(async () => null);
  const res = await request(app).get('/api/evenements/999/plan');
  assert.equal(res.status, 404);
});

test('GET /api/evenements/:id/plan marque réservés les sièges confirmés et libres les autres', async (t) => {
  prisma.evenement.findUnique = t.mock.fn(async () => ({
    id: 1,
    salle: {
      id: 19,
      nom: 'Salle A',
      sieges: [
        { id: 101, numeroRangee: 1, numeroColonne: 1 },
        { id: 102, numeroRangee: 1, numeroColonne: 2 },
      ],
    },
    reservations: [{ siegeId: 101 }],
  }));

  const res = await request(app).get('/api/evenements/1/plan');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, {
    evenementId: 1,
    salle: { id: 19, nom: 'Salle A' },
    sieges: [
      { id: 101, rangee: 1, colonne: 1, etat: 'reserve' },
      { id: 102, rangee: 1, colonne: 2, etat: 'libre' },
    ],
  });
});

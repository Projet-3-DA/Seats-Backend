jest.mock('../../lib/prisma');
// On simule aussi le stockage : sans ça, POST /affiche appellerait la vraie API Supabase (et lirait
// de vrais identifiants s'il y a un .env local) à chaque exécution des tests.
jest.mock('../../lib/storage', () => ({
  TYPES_ACCEPTES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  uploadImage: jest.fn(),
}));

const request = require('supertest');
const app = require('../../app');
const prisma = require('../../lib/prisma');
const storage = require('../../lib/storage');

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

describe('GET /api/evenements', () => {
  it('renvoie la liste des événements', async () => {
    const liste = [{ id: 1, titre: 'Concert', salle: { id: 19, nom: 'Salle A' } }];
    prisma.evenement.findMany.mockResolvedValue(liste);

    const res = await request(app).get('/api/evenements');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: liste });
  });

  it('renvoie 500 si la base de données échoue', async () => {
    prisma.evenement.findMany.mockRejectedValue(new Error('connexion perdue'));

    const res = await request(app).get('/api/evenements');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/evenements', () => {
  it('refuse un corps invalide sans toucher à la base (400)', async () => {
    const res = await request(app).post('/api/evenements').send(corpsValide({ titre: '' }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: expect.stringMatching(/titre est requis/) });
    expect(prisma.evenement.create).not.toHaveBeenCalled();
  });

  it('crée l\'événement quand la salle existe et appartient à l\'organisateur (201)', async () => {
    prisma.salle.findUnique.mockResolvedValue({ id: 19, organisateurId: 1 });
    const cree = { id: 1, titre: 'Festival de Jazz', salle: { id: 19, nom: 'Salle A' } };
    prisma.evenement.create.mockResolvedValue(cree);

    const res = await request(app)
      .post('/api/evenements')
      .send(corpsValide({ titre: '  Festival de Jazz  ', description: '  Une soirée jazz  ' }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: cree });

    const donneesEnvoyees = prisma.evenement.create.mock.calls[0][0].data;
    expect(donneesEnvoyees.titre).toBe('Festival de Jazz'); // nettoyé (trim)
    expect(donneesEnvoyees.description).toBe('Une soirée jazz'); // nettoyé (trim)
    expect(donneesEnvoyees.tarif).toBe(25);
    expect(donneesEnvoyees.dateHeure).toBeInstanceOf(Date);
  });

  it('accepte une description et une afficheUrl absentes (null en base)', async () => {
    prisma.salle.findUnique.mockResolvedValue({ id: 19, organisateurId: 1 });
    prisma.evenement.create.mockResolvedValue({ id: 1 });

    await request(app).post('/api/evenements').send(corpsValide({ description: undefined, afficheUrl: undefined }));

    const donneesEnvoyees = prisma.evenement.create.mock.calls[0][0].data;
    expect(donneesEnvoyees.description).toBeNull();
    expect(donneesEnvoyees.afficheUrl).toBeNull();
  });

  it('refuse avec 404 si la salle n\'existe pas', async () => {
    prisma.salle.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/evenements').send(corpsValide({ salleId: 999 }));

    expect(res.status).toBe(404);
    expect(prisma.evenement.create).not.toHaveBeenCalled();
  });

  it('refuse avec 403 si la salle appartient à un autre organisateur', async () => {
    prisma.salle.findUnique.mockResolvedValue({ id: 19, organisateurId: 2 });

    const res = await request(app).post('/api/evenements').send(corpsValide({ organisateurId: 1 }));

    expect(res.status).toBe(403);
    expect(prisma.evenement.create).not.toHaveBeenCalled();
  });

  it('traduit une violation de contrainte Prisma (P2003) en 400', async () => {
    prisma.salle.findUnique.mockResolvedValue({ id: 19, organisateurId: 1 });
    prisma.evenement.create.mockRejectedValue(Object.assign(new Error('FK violation'), { code: 'P2003' }));

    const res = await request(app).post('/api/evenements').send(corpsValide());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Organisateur introuvable/);
  });

  it('renvoie 500 pour une erreur inattendue de la base', async () => {
    prisma.salle.findUnique.mockResolvedValue({ id: 19, organisateurId: 1 });
    prisma.evenement.create.mockRejectedValue(new Error('boum'));

    const res = await request(app).post('/api/evenements').send(corpsValide());

    expect(res.status).toBe(500);
  });
});

describe('POST /api/evenements/affiche', () => {
  it('refuse un Content-Type non accepté (400)', async () => {
    const res = await request(app)
      .post('/api/evenements/affiche')
      .set('Content-Type', 'text/plain')
      .send('pas une image');

    expect(res.status).toBe(400);
    expect(storage.uploadImage).not.toHaveBeenCalled();
  });

  it('refuse un corps vide (400)', async () => {
    const res = await request(app)
      .post('/api/evenements/affiche')
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(0));

    expect(res.status).toBe(400);
  });

  it('refuse une image de plus de 5 Mo (413)', async () => {
    const res = await request(app)
      .post('/api/evenements/affiche')
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(5 * 1024 * 1024 + 10));

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/5 Mo/);
  });

  it('envoie l\'image au stockage et renvoie son URL publique (201)', async () => {
    storage.uploadImage.mockResolvedValue('https://exemple.supabase.co/storage/v1/object/public/affiches/x.jpg');

    const res = await request(app)
      .post('/api/evenements/affiche')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('donnees-image'));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { url: expect.stringContaining('/affiches/') } });
    expect(storage.uploadImage).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
  });

  it('renvoie l\'erreur du service de stockage (ex. 502)', async () => {
    const httpError = require('../../lib/http-error');
    storage.uploadImage.mockRejectedValue(httpError(502, "Échec de l'envoi de l'image vers le stockage."));

    const res = await request(app)
      .post('/api/evenements/affiche')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('x'));

    expect(res.status).toBe(502);
  });
});

describe('GET /api/evenements/:id/plan', () => {
  it('refuse un id non numérique (400)', async () => {
    const res = await request(app).get('/api/evenements/abc/plan');
    expect(res.status).toBe(400);
  });

  it('renvoie 404 si l\'événement n\'existe pas', async () => {
    prisma.evenement.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/evenements/999/plan');

    expect(res.status).toBe(404);
  });

  it('marque réservés les sièges confirmés et libres les autres', async () => {
    prisma.evenement.findUnique.mockResolvedValue({
      id: 1,
      salle: {
        id: 19,
        nom: 'Salle A',
        sieges: [
          { id: 101, numeroRangee: 1, numeroColonne: 1 },
          { id: 102, numeroRangee: 1, numeroColonne: 2 },
        ],
      },
      reservations: [{ siegeId: 101, statut: 'confirmee' }],
    });

    const res = await request(app).get('/api/evenements/1/plan');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      evenementId: 1,
      salle: { id: 19, nom: 'Salle A' },
      sieges: [
        { id: 101, rangee: 1, colonne: 1, etat: 'reserve' },
        { id: 102, rangee: 1, colonne: 2, etat: 'libre' },
      ],
    });
  });

});

jest.mock('../config/env', () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceKey: 'sb_secret_test',
  supabaseBucket: 'affiches',
}));

const env = require('../config/env');
const { uploadImage, TYPES_ACCEPTES } = require('./storage');

const fetchOriginal = global.fetch;

afterAll(() => {
  global.fetch = fetchOriginal;
});

afterEach(() => {
  Object.assign(env, {
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceKey: 'sb_secret_test',
    supabaseBucket: 'affiches',
  });
});

describe('TYPES_ACCEPTES', () => {
  it('liste les 4 formats d\'image pris en charge', () => {
    expect(TYPES_ACCEPTES.sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'].sort());
  });
});

describe('uploadImage', () => {
  it('refuse si le stockage n\'est pas configuré (URL manquante)', async () => {
    Object.assign(env, { supabaseUrl: '' });
    global.fetch = jest.fn();
    await expect(uploadImage(Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/pas configuré/),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuse si le stockage n\'est pas configuré (clé manquante)', async () => {
    Object.assign(env, { supabaseServiceKey: '' });
    global.fetch = jest.fn();
    await expect(uploadImage(Buffer.from('x'), 'image/png')).rejects.toMatchObject({ status: 500 });
  });

  it('envoie la clé en apikey uniquement pour une clé sb_secret_… (pas de JWT)', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await uploadImage(Buffer.from('image'), 'image/png');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.apikey).toBe('sb_secret_test');
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('ajoute aussi Authorization: Bearer pour une clé service_role legacy (JWT eyJ…)', async () => {
    Object.assign(env, { supabaseServiceKey: 'eyJhbGciOiJIUzI1NiJ9.x.y' });
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await uploadImage(Buffer.from('image'), 'image/png');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.apikey).toBe('eyJhbGciOiJIUzI1NiJ9.x.y');
    expect(options.headers.Authorization).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.x.y');
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ])('choisit l\'extension %s -> .%s et renvoie l\'URL publique du bucket', async (contentType, extension) => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const url = await uploadImage(Buffer.from('image'), contentType);

    expect(url).toMatch(
      new RegExp(`^https://test\\.supabase\\.co/storage/v1/object/public/affiches/evenements/[0-9a-f-]+\\.${extension}$`),
    );
    const [requestUrl, options] = global.fetch.mock.calls[0];
    expect(requestUrl).toBe(`https://test.supabase.co/storage/v1/object/affiches/${url.split('/affiches/')[1]}`);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe(contentType);
    expect(options.body).toBeInstanceOf(Buffer);
  });

  it('génère une adresse différente à chaque appel (UUID)', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const url1 = await uploadImage(Buffer.from('a'), 'image/png');
    const url2 = await uploadImage(Buffer.from('b'), 'image/png');
    expect(url1).not.toBe(url2);
  });

  it('rejette avec un 502 si Supabase répond une erreur', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('bucket introuvable', { status: 400 }));
    await expect(uploadImage(Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/Échec de l'envoi/),
    });
  });
});

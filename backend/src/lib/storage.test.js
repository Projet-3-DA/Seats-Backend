const { test } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../config/env');
const { uploadImage, TYPES_ACCEPTES } = require('./storage');

const ENV_PAR_DEFAUT = { supabaseUrl: 'https://test.supabase.co', supabaseServiceKey: 'sb_secret_test', supabaseBucket: 'affiches' };

function reinitialiserEnv() {
  Object.assign(env, ENV_PAR_DEFAUT);
}

test('TYPES_ACCEPTES liste les 4 formats d\'image pris en charge', () => {
  assert.deepEqual(TYPES_ACCEPTES.slice().sort(), ['image/gif', 'image/jpeg', 'image/png', 'image/webp'].sort());
});

test('uploadImage() refuse si le stockage n\'est pas configuré (URL manquante)', async (t) => {
  reinitialiserEnv();
  Object.assign(env, { supabaseUrl: '' });
  const fetchMock = t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch ne devrait pas être appelé');
  });

  await assert.rejects(() => uploadImage(Buffer.from('x'), 'image/png'), /pas configuré/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('uploadImage() refuse si le stockage n\'est pas configuré (clé manquante)', async () => {
  reinitialiserEnv();
  Object.assign(env, { supabaseServiceKey: '' });

  await assert.rejects(() => uploadImage(Buffer.from('x'), 'image/png'), (err) => err.status === 500);
});

test('uploadImage() envoie la clé en apikey uniquement pour une clé sb_secret_… (pas de JWT)', async (t) => {
  reinitialiserEnv();
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 200 }));

  await uploadImage(Buffer.from('image'), 'image/png');

  const [, options] = global.fetch.mock.calls[0].arguments;
  assert.equal(options.headers.apikey, 'sb_secret_test');
  assert.equal(options.headers.Authorization, undefined);
});

test('uploadImage() ajoute aussi Authorization: Bearer pour une clé service_role legacy (JWT eyJ…)', async (t) => {
  reinitialiserEnv();
  Object.assign(env, { supabaseServiceKey: 'eyJhbGciOiJIUzI1NiJ9.x.y' });
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 200 }));

  await uploadImage(Buffer.from('image'), 'image/png');

  const [, options] = global.fetch.mock.calls[0].arguments;
  assert.equal(options.headers.apikey, 'eyJhbGciOiJIUzI1NiJ9.x.y');
  assert.equal(options.headers.Authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y');
});

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
for (const [contentType, extension] of Object.entries(EXTENSIONS)) {
  test(`uploadImage() choisit l'extension ${contentType} -> .${extension} et renvoie l'URL publique du bucket`, async (t) => {
    reinitialiserEnv();
    t.mock.method(global, 'fetch', async () => new Response('{}', { status: 200 }));

    const url = await uploadImage(Buffer.from('image'), contentType);

    assert.match(url, new RegExp(`^https://test\\.supabase\\.co/storage/v1/object/public/affiches/evenements/[0-9a-f-]+\\.${extension}$`));
    const [requestUrl, options] = global.fetch.mock.calls[0].arguments;
    assert.equal(requestUrl, `https://test.supabase.co/storage/v1/object/affiches/${url.split('/affiches/')[1]}`);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], contentType);
    assert.ok(Buffer.isBuffer(options.body));
  });
}

test('uploadImage() génère une adresse différente à chaque appel (UUID)', async (t) => {
  reinitialiserEnv();
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 200 }));

  const url1 = await uploadImage(Buffer.from('a'), 'image/png');
  const url2 = await uploadImage(Buffer.from('b'), 'image/png');

  assert.notEqual(url1, url2);
});

test('uploadImage() rejette avec un 502 si Supabase répond une erreur', async (t) => {
  reinitialiserEnv();
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async () => new Response('bucket introuvable', { status: 400 }));

  await assert.rejects(
    () => uploadImage(Buffer.from('x'), 'image/png'),
    (err) => err.status === 502 && /Échec de l'envoi/.test(err.message),
  );
});

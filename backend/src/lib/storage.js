const { randomUUID } = require('crypto');
const env = require('../config/env');
const httpError = require('./http-error');

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const TYPES_ACCEPTES = Object.keys(EXTENSIONS);

// Envoie l'image dans le bucket Supabase Storage (API REST) et renvoie son URL publique.
// Le bucket doit être créé en "public" dans le tableau de bord Supabase.
async function uploadImage(buffer, contentType) {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw httpError(500, "Le stockage des images n'est pas configuré (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY).");
  }

  const chemin = `evenements/${randomUUID()}.${EXTENSIONS[contentType]}`;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${env.supabaseBucket}/${chemin}`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseServiceKey,
      // Ancienne clé service_role = JWT (eyJ…), acceptée en Bearer. Les clés sb_secret_… ne sont pas
      // des JWT : elles ne doivent circuler que dans apikey.
      ...(env.supabaseServiceKey.startsWith('eyJ') && { Authorization: `Bearer ${env.supabaseServiceKey}` }),
      'Content-Type': contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    console.error('[Storage]:', res.status, await res.text());
    throw httpError(502, "Échec de l'envoi de l'image vers le stockage.");
  }

  return `${env.supabaseUrl}/storage/v1/object/public/${env.supabaseBucket}/${chemin}`;
}

module.exports = {
  TYPES_ACCEPTES,
  uploadImage,
};

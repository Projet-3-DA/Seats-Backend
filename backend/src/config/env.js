require('dotenv/config');

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-change-in-env',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Stockage des images (Supabase Storage). Clé "service_role" : à ne jamais exposer au frontend.
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'affiches',
};

require('dotenv/config');

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-change-in-env',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Stockage des images (Supabase Storage). Clé "service_role" : à ne jamais exposer au frontend.
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'affiches',
  // Connexion avec GitHub (OAuth App). Le secret reste côté serveur, jamais envoyé au frontend.
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  // Doit correspondre exactement à l'« Authorization callback URL » de l'OAuth App.
  githubCallbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback',
  // Où renvoyer le navigateur une fois connecté (le frontend lit le token dans l'URL).
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
};

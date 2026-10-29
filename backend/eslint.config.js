// Lint du backend (CommonJS sous Node, tests Jest). Lancé par `npm run lint` et par la CI.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'src/generated/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // `const { motDePasse, ...reste } = user` sert à retirer un champ ; `_next` garde l'arité d'Express.
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.js', '**/__mocks__/**'],
    languageOptions: { globals: { ...globals.jest } },
  },
];

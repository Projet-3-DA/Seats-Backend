#!/bin/sh
# Démarrage du conteneur : la base est prête et contient les comptes de démonstration avant que l'API
# n'accepte des requêtes. Les deux premières étapes sont idempotentes (redémarrage sans perte de données).
set -e

npx prisma migrate deploy
node prisma/seed.js
exec node src/server.js

const { test } = require('node:test');

// Récits du backlog sans module backend existant : pas de fichier de test
// dédié tant que le code n'existe pas (voir docs/02-backlog.md côté frontend).
// À déplacer dans le bon *.service.test.js dès que le module est créé.

test.todo('Suivi organisateur : tableau de bord des ventes par événement (#13)');
test.todo('Suivi organisateur : mise à jour des ventes en temps réel (#35)');
test.todo('Suivi organisateur : statistiques de vente par section tarifaire (#22)');
test.todo("Administration : liste des organisateurs avec nombre d'événements (#19)");
test.todo('Administration : liste globale des événements, tous organisateurs confondus (#36)');
test.todo("Administration : suspension/réactivation d'un compte (#20)");
test.todo('Administration : un compte suspendu ne peut plus se connecter (#41)');
test.todo("Temps réel : diffusion WebSocket d'un siège passé « en sélection » (#8)");
test.todo('Temps réel : resynchronisation du plan de salle après une reconnexion (#17)');

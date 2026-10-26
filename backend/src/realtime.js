const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./config/env');

const DELAI_SELECTION_MS = 60_000;

// Sièges « en sélection » (#8, #31, #32), clé `${evenementId}:${siegeId}` → { userId, socketId, timer }.
// ponytail: en mémoire, donc perdu au redémarrage et limité à une seule instance du serveur ; passer par
// les réservations `en_selection` en base (ou un adaptateur Redis) si on déploie plusieurs instances.
const selections = new Map();
let io = null;

const cle = (evenementId, siegeId) => `${evenementId}:${siegeId}`;
const salon = (evenementId) => `evenement:${evenementId}`;

function liberer(evenementId, siegeId) {
  const k = cle(evenementId, siegeId);
  const s = selections.get(k);
  if (!s) return;
  clearTimeout(s.timer);
  selections.delete(k);
  io?.to(salon(evenementId)).emit('siege:libere', { siegeId });
}

function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  // Visiteur anonyme accepté (il voit le plan bouger) ; seul un spectateur connecté peut sélectionner.
  io.use((socket, next) => {
    try {
      const { userId, role } = jwt.verify(socket.handshake.auth?.token, jwtSecret);
      socket.data.user = { id: userId, role };
    } catch {
      socket.data.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('plan:rejoindre', (evenementId) => {
      socket.join(salon(evenementId));
      const prefixe = `${evenementId}:`;
      const siegeIds = [...selections]
        .filter(([k, s]) => k.startsWith(prefixe) && s.socketId !== socket.id)
        .map(([k]) => Number(k.slice(prefixe.length)));
      socket.emit('plan:selections', { siegeIds });
    });

    socket.on('plan:quitter', (evenementId) => socket.leave(salon(evenementId)));

    socket.on('siege:selectionner', ({ evenementId, siegeId }, ack) => {
      const user = socket.data.user;
      if (user?.role !== 'spectateur') return ack?.({ ok: false, error: 'Réservé aux spectateurs connectés.' });
      const k = cle(evenementId, siegeId);
      if (selections.has(k)) return ack?.({ ok: false, error: 'Ce siège est en cours de sélection par quelqu\'un d\'autre.' });
      const timer = setTimeout(() => liberer(evenementId, siegeId), DELAI_SELECTION_MS);
      selections.set(k, { userId: user.id, socketId: socket.id, timer });
      socket.to(salon(evenementId)).emit('siege:selectionne', { siegeId });
      ack?.({ ok: true });
    });

    socket.on('siege:deselectionner', ({ evenementId, siegeId }) => {
      if (selections.get(cle(evenementId, siegeId))?.socketId === socket.id) liberer(evenementId, siegeId);
    });

    socket.on('disconnect', () => {
      for (const [k, s] of selections) {
        if (s.socketId !== socket.id) continue;
        const [evenementId, siegeId] = k.split(':').map(Number);
        liberer(evenementId, siegeId);
      }
    });
  });
  return io;
}

function estSelectionneParAutre(evenementId, siegeIds, userId) {
  return siegeIds.some((id) => {
    const s = selections.get(cle(evenementId, id));
    return s && s.userId !== userId;
  });
}

// Après une réservation confirmée : on retire les sélections et tout le monde voit les sièges passer à « réservé ».
function diffuserReserves(evenementId, siegeIds) {
  siegeIds.forEach((id) => {
    const s = selections.get(cle(evenementId, id));
    if (s) clearTimeout(s.timer);
    selections.delete(cle(evenementId, id));
  });
  io?.to(salon(evenementId)).emit('sieges:reserves', { siegeIds });
}

module.exports = { init, estSelectionneParAutre, diffuserReserves, DELAI_SELECTION_MS };

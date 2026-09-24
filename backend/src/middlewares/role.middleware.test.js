const roleMiddleware = require('./role.middleware');

function reponseFake() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// roleMiddleware n'est câblé sur aucune route pour l'instant (grep confirmé :
// aucun module ne l'importe) — toutes les routes sont actuellement ouvertes.
// À écrire une fois câblé, en tests d'intégration HTTP directs (#9, #33) :
it.todo('POST /api/evenements refuse un spectateur avec 403 (#3, #33)');
it.todo('POST /api/salles refuse un spectateur avec 403 (#33)');
it.todo("les routes d'administration refusent organisateur et spectateur (#19, #33)");

describe('roleMiddleware', () => {
  it('refuse avec 403 quand req.user est absent (pas encore authentifié)', () => {
    const middleware = roleMiddleware('organisateur');
    const req = {};
    const res = reponseFake();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuse avec 403 quand le rôle de req.user n\'est pas autorisé', () => {
    const middleware = roleMiddleware('organisateur', 'administrateur');
    const req = { user: { role: 'spectateur' } };
    const res = reponseFake();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('laisse passer quand le rôle de req.user est dans la liste autorisée', () => {
    const middleware = roleMiddleware('organisateur', 'administrateur');
    const req = { user: { role: 'organisateur' } };
    const res = reponseFake();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('crée un middleware indépendant à chaque appel (rôles différents)', () => {
    const spectateurUniquement = roleMiddleware('spectateur');
    const req = { user: { role: 'organisateur' } };
    const res = reponseFake();
    const next = jest.fn();

    spectateurUniquement(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

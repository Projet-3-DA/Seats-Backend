const roleMiddleware = require('./role.middleware');

function reponseFake() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

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

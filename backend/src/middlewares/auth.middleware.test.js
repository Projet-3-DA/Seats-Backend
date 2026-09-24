const authMiddleware = require('./auth.middleware');

function reponseFake() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  it('refuse avec 401 quand l\'en-tête Authorization est absent', () => {
    const req = { headers: {} };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['sans le préfixe Bearer', 'Basic abc123'],
    ['vide', ''],
  ])('refuse avec 401 quand le token est %s', (_label, authorization) => {
    const req = { headers: { authorization } };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  // Documente l'état actuel, pas un comportement souhaité : le TODO du middleware (vérifier le JWT,
  // remplir req.user) n'est pas fait, donc n'importe quel texte après "Bearer " est accepté pour l'instant.
  it('laisse passer une requête avec un en-tête Bearer et appelle next()', () => {
    const req = { headers: { authorization: 'Bearer un-token' } };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

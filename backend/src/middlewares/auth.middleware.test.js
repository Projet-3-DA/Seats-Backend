const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const authMiddleware = require('./auth.middleware');

function reponseFake() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function jeton(payload, options) {
  return jwt.sign(payload, jwtSecret, options);
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

  it('refuse avec 401 un token invalide (signature incorrecte)', () => {
    const req = { headers: { authorization: 'Bearer un-token-invalide' } };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuse avec 401 un token expiré', () => {
    const token = jeton({ userId: 1, role: 'spectateur' }, { expiresIn: -10 });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuse avec 401 un token signé avec une autre clé', () => {
    const token = jwt.sign({ userId: 1, role: 'spectateur' }, 'une-autre-cle');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepte un token valide, remplit req.user et appelle next()', () => {
    const token = jeton({ userId: 42, role: 'organisateur' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = reponseFake();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toEqual({ id: 42, role: 'organisateur' });
  });
});

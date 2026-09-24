const httpError = require('./http-error');

describe('httpError', () => {
  it('crée une Error avec le message donné', () => {
    const err = httpError(404, 'Introuvable');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Introuvable');
  });

  it('attache le status à l\'erreur', () => {
    const err = httpError(403, 'Interdit');
    expect(err.status).toBe(403);
  });

  it('produit des erreurs indépendantes à chaque appel', () => {
    const a = httpError(400, 'a');
    const b = httpError(500, 'b');
    expect(a).not.toBe(b);
    expect(a.status).toBe(400);
    expect(b.status).toBe(500);
  });
});

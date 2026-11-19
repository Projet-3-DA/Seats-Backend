const { MESSAGE_COMPTE_SUSPENDU, verifierCompteActif, organisateurSuspendu } = require('./compte-suspendu');

describe('verifierCompteActif (#41)', () => {
  it('laisse passer un compte actif', () => {
    expect(() => verifierCompteActif({ id: 1, statut: 'actif' })).not.toThrow();
  });

  it('refuse un compte suspendu (403) avec un message clair, sans la raison interne', () => {
    let erreur;
    try {
      verifierCompteActif({ id: 1, statut: 'suspendu', raisonSuspension: 'Note interne' });
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toMatchObject({ status: 403, message: MESSAGE_COMPTE_SUSPENDU });
    expect(erreur.message).toMatch(/suspendu/);
    expect(erreur.message).not.toMatch(/Note interne/);
  });
});

describe('organisateurSuspendu (#41)', () => {
  it.each([
    [{ statut: 'suspendu' }, true],
    [{ statut: 'actif' }, false],
    [undefined, false],
  ])('%p -> %p', (organisateur, attendu) => {
    expect(organisateurSuspendu(organisateur)).toBe(attendu);
  });
});

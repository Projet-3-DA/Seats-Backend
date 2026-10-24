const { prixSiege, formatSection } = require('./prix');

describe('prixSiege (#11)', () => {
  it('prend le prix de la section du siège', () => {
    expect(prixSiege({ section: { prix: '45.50' } }, 25)).toBe(45.5);
  });

  it("prend le tarif de l'événement pour un siège hors section", () => {
    expect(prixSiege({ section: null }, '25.00')).toBe(25);
    expect(prixSiege({}, 25)).toBe(25);
  });

  it("garde le prix de la section même si l'événement n'a pas de tarif", () => {
    expect(prixSiege({ section: { prix: 30 } }, null)).toBe(30);
  });

  it('renvoie null si ni la section ni le tarif ne sont connus', () => {
    expect(prixSiege({}, null)).toBeNull();
    expect(prixSiege({}, undefined)).toBeNull();
  });

  it('accepte une section gratuite (prix 0)', () => {
    expect(prixSiege({ section: { prix: '0.00' } }, 25)).toBe(0);
  });
});

describe('formatSection', () => {
  it('convertit le prix en nombre et ne garde que les champs utiles', () => {
    expect(formatSection({ id: 1, salleId: 3, nom: 'Balcon', prix: '30.00', couleur: '#2563eb', createdAt: new Date() })).toEqual({
      id: 1,
      nom: 'Balcon',
      prix: 30,
      couleur: '#2563eb',
    });
  });
});

const errorMiddleware = require('./error.middleware');

function reponseFake() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorMiddleware', () => {
  const consoleErrorOriginal = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = consoleErrorOriginal;
  });

  it('utilise err.status quand il est présent', () => {
    const res = reponseFake();
    errorMiddleware(Object.assign(new Error('Interdit'), { status: 403 }), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Interdit' });
  });

  it('utilise err.statusCode si err.status est absent', () => {
    const res = reponseFake();
    errorMiddleware(Object.assign(new Error('Non trouvé'), { statusCode: 404 }), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retombe sur 500 sans status ni statusCode', () => {
    const res = reponseFake();
    errorMiddleware(new Error('Boum'), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Boum' });
  });

  it('retombe sur un message générique sans message d\'erreur', () => {
    const res = reponseFake();
    const err = new Error();
    err.message = '';
    errorMiddleware(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Erreur interne du serveur' });
  });

  it('journalise l\'erreur', () => {
    const res = reponseFake();
    errorMiddleware(new Error('trace'), {}, res, jest.fn());
    expect(console.error).toHaveBeenCalled();
  });
});

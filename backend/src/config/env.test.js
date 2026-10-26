jest.mock('dotenv', () => ({ config: jest.fn() }));

const path = require('path');
const dotenv = require('dotenv');

describe('config/env', () => {
  it('charge toujours backend/.env, quel que soit le dossier de lancement', () => {
    jest.isolateModules(() => require('./env'));

    expect(dotenv.config).toHaveBeenCalledWith({ path: path.resolve(__dirname, '..', '..', '.env') });
  });
});

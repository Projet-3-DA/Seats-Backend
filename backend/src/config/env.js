require('dotenv/config');

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-change-in-env',
  nodeEnv: process.env.NODE_ENV || 'development',
};

const deepmerge = require('deepmerge');
const dotenv = require('dotenv');

const pack = require('../package.json');
// Read .env files into process.env
const env = process.env.NODE_ENV || 'dev';
dotenv.config({ path: '.env' });
dotenv.config({ path: `.env-${env}` });

// Default configuration
let config = {
  env,
  name: pack.name,
  version: pack.version,
  service: pack.name,
};

// Extra configurations are named after NODE_ENV and merged into config
// Providing .env-{NODE_ENV} file is preferable to editing this file
const configs = {};

// Unit testing
configs.dev = {
  db: {
    host: process.env.DB_HOST || '0.0.0.0',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    region: process.env.DB_AWS_REGION || process.env.AWS_DEFAULT_REGION,
    ssl: process.env.DB_SSL,
    useIAM: process.env.DB_USE_IAM,
  },
  logging: {
    categories: {
      default: {
        console: 'silly',
        file: 'silly',
        errorFile: 'on',
        cloudWatch: 'off',
      },
    },
  },
};

if (env in configs) {
  config = deepmerge(config, configs[env], { arrayMerge: (destination, source) => [...destination, ...source] });
}

module.exports = config;

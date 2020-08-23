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
  logging: {
    cloudWatch: {
      // region: 'us-west-2', // set AWS_CLOUDWATCH_LOGS_REGION environment variable
      logGroup: `/${env}/winstonplus`,
    },
  },
};

// Extra configurations are named after NODE_ENV and merged into config
// Providing .env-{NODE_ENV} file is preferable to editing this file
const configs = {};

// Unit testing
configs.dev = {
  logging: {
    categories: {
      default: {
        console: 'silly',
        file: 'silly',
        errorFile: 'on',
        cloudWatch: 'on',
      },
    },
  },
};

if (env in configs) {
  config = deepmerge(config, configs[env], { arrayMerge: (destination, source) => [...destination, ...source] });
}

module.exports = config;

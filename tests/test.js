/* eslint-disable no-console */
const MySqlConnector = require('../index');
const config = require('./config.js');

function test() {
  return new MySqlConnector(config).connect();
}

test().then(() => console.log('Successful'), console.error);

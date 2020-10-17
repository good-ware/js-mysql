/* eslint-disable no-console */
const MySqlConnector = require('../MySqlConnector');
const config = require('./config.js');

function test() {
  return new MySqlConnector(config).connect();
}

test().then(() => console.log('Successful'), console.error);

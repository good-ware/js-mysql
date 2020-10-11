/* eslint-disable no-console */
const MySql = require('../MySql');
const config = require('./config.js');

function test() {
  return new MySql(config).connect();
}

test().then(() => console.log('Successful'), console.error);

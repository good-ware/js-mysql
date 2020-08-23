/* eslint-disable no-console */
const MySqlExec = require('../MySqlExec');
const config = require('./config.js');

function test() {
  return new MySqlExec(config).checkConnection();
}

test().then(() => console.log('Successful'), console.error);

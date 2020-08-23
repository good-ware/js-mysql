/* eslint-disable no-console */
const MySqlExec = require('../MySqlExec');
const config = require('./config.js');

go() {
  return new MySqlExec(config).checkConnection();
}

go().then(()=>console.log('Successful'), (error)=>console.error);


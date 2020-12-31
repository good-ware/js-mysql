/* eslint-disable no-console */
const MySqlConnector = require('../index');
const config = require('./config.js');

class Logger {
  // eslint-disable-next-line class-methods-use-this
  log(tags, message, extra) {
    console.log({ tags, message, extra });
  }
}

const logger = new Logger();

const test = async () => {
  config.host = '17.1.1.1';
  const connector = new MySqlConnector(config, logger.log);
  // Test the connection
  await connector.connect();
  const result = await connector.execute(async (connection) => {
    const [results] = await connection.query(`select 'success' AS status`);
    return results[0].status;
  });

  if (result !== 'success') throw new Error('failed');
};

test().then(() => console.log('Successful'), console.error);

/* eslint-disable no-console */
const MySqlConnector = require('../index');
const config = require('./config');

class Logger {
  // eslint-disable-next-line class-methods-use-this
  log(tags, message, data) {
    console.log({ tags, message, data });
  }
}

const logger = new Logger();

const test = async () => {
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

/* eslint-disable no-param-reassign */

const AWS = require('aws-sdk');
const humanizeDuration = require('humanize-duration');
const Joi = require('joi');
const mysql2 = require('mysql2/promise');

/* Testing
 *
 * There are currently no unit tests. Instead, only whitebox testing is
 * performed manually via uncommenting code. Search for "Test scenario".
 */

/**
 * @description Schema for module's options. See also
 * https://github.com/mysqljs/mysql#pool-options.
 */
const optionsSchema = Joi.object({
  // acquireTimeout:
  // Joi.number().integer().min(0).default(10000).description('Not currently
  // used'),
  connectionLimit: Joi.number().integer().min(0).default(10),
  connectTimeout: Joi.number()
    .integer()
    .min(0)
    .default(10000)
    .description('Timeout, in milliseconds, to wait for a single database connection'),
  connectRetryTimeout: Joi.number()
    .integer()
    .min(0)
    .default(5 * 60 * 1000)
    .description('Timeout, in milliseconds, to retry for a connection in case of connection failures'),
  database: Joi.string().required(),
  enableKeepAlive: Joi.boolean(),
  host: Joi.string().required(),
  keepAliveInitialDelay: Joi.number().integer().min(0).default(10000),
  // eslint-disable-next-line quotes
  maxConnectDelay: Joi.number().integer().min(0).default(100000).description(
    `Maximum number of milliseconds to wait 
between connection attempts (starts at 10 ms and increases exponentially)`
  ),
  multipleStatements: Joi.boolean(),
  password: Joi.string().when('useIAM', {
    is: true,
    then: Joi.optional(),
    otherwise: Joi.string().required(),
  }),
  port: Joi.number().integer().default(3306),
  queueLimit: Joi.number().integer().min(0).default(0),
  region: Joi.string().when('useIAM', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  ssl: Joi.string(),
  useIAM: Joi.boolean().default(false), // This is logged so default it to false
  user: Joi.string().required(),
  usePool: Joi.boolean(),
});

/**
 * @description Creates mysql2-promise Connection objects, optionally from a
 * pool and optionally manages database transactions.
 *
 * @todo
 * 1. Document retry connection behavior
 *
 * Properties:
 *   connectOptions
 *   usePool
 *   useIAM
 *   connectionPool
 *   maxConnectDelay
 *   connectRetryTimeout
 *   stopped
 */
class MySql {
  /**
   * @constructor
   * @description Optionally call checkConnection() afterward to check the
   * connection.
   * @param {Object} options Database connection options
   */
  constructor(options) {
    const validation = optionsSchema.validate(options);
    if (validation.error) throw new Error(validation.error.message);
    options = validation.value;

    // Initialization that doesn't require async
    Object.assign(this, {
      logger: options.logger,
      usePool: options.usePool,
      useIAM: options.useIAM,
      maxConnectDelay: options.maxConnectDelay,
      connectRetryTimeout: options.connectRetryTimeout,
    });

    // These are sent to mysql2. Only add properties supported by mysql2.
    this.connectOptions = {
      host: options.host,
      port: options.port,
      user: options.user,
      password: options.password,
      database: options.database,
      ssl: options.ssl,
      connectTimeout: options.connectTimeout,
      multipleStatements: options.multipleStatements,
    };

    if (this.useIAM) {
      // See
      // https://stackoverflow.com/questions/58067254/node-mysql2-aws-rds-signer-connection-pooling/60013378#60013378
      const signer = new AWS.RDS.Signer();
      // eslint-disable-next-line require-jsdoc
      const iamTokenPlugin = () => () =>
        signer.getAuthToken({
          region: options.region,
          hostname: options.host,
          port: options.port,
          username: options.user,
        });

      this.connectOptions.authPlugins = { mysql_clear_password: iamTokenPlugin };
    }

    if (this.usePool) {
      Object.assign(this.connectOptions, {
        connectionLimit: options.connectionLimit,
        queueLimit: options.queueLimit,
        // acquireTimeout is not yet supported by mysql2
        // acquireTimeout: options.acquireTimeout,
        enableKeepAlive: options.enableKeepAlive,
        keepAliveInitialDelay: options.keepAliveInitialDelay,
        /* @todo In order for decimals to be returned as numbers instead of
        strings, add an option
         * and add this code conditionally. See
        https://github.com/sidorares/node-mysql2/issues/795
         * I tried this and it didn't work.
        typeCast: (field, next) => {
          if (field.type === "DECIMAL") {
            const value = field.string();
            return (value === null) ? null : Number(value);
          }
          return next();
        },
        */
      });

      this.connectionPool = mysql2.createPool(this.connectOptions);
    }

    this.stopped = false;
  }

  /**
   * @description Closes the connection pool. Subsequent calls to connect() will
   * fail.
   * @return {Promise}
   */
  stop() {
    this.stopped = true;

    const pool = this.connectionPool;
    if (!pool) return 0;

    delete this.connectionPool;
    return pool.end();
  }

  /**
   * @description Runs a bogus SQL statement to check the database connection
   * @return {Promise}
   */
  checkConnection() {
    return this.connect((connection) => connection.query('SELECT 1'));
  }

  /**
   * @description Acquires a database connection and invokes a function that
   * accepts a mysql2 Connection object. Each call to connection.query() etc. is
   * run in a separate transaction.
   *
   * @param {Function} task A function that accepts a mysql2 connection object
   *     as the first parameter
   * @param {Object} [logger]
   * @return {Promise} The value returned by task(), if the database connection
   *     is successful
   * @throws {Error} The error caught while:
   *   1. connecting to the database
   *   2. await task()
   */
  execute(task, logger) {
    return this.connect(task, logger, false);
  }

  /**
   * @description Acquires a database connection, begins a transaction on that
   * connection, invokes a function that accepts a mysql2 Connection object that
   * uses a shared transaction, and either commits or rolls back the
   *  transaction, depending on whether the function throws an exception.
   *
   * @param {Function} task A function that accepts a mysql2 connection object
   *     as the first parameter
   * @param {Object} [logger]
   * @return {Promise} The value returned by task(), if the database connection
   *     is successful
   * @throws {Error} The error caught while:
   *   1. connecting to the database
   *   2. starting a transaction
   *   3. await task()
   *   4. committing the transaction
   */
  transaction(task, logger) {
    return this.connect(task, logger);
  }

  /**
   * @description Internal. Acquires a database connection and invokes a
   * function.
   * @param {Function} task A function that accepts a mysql2 connection object
   *     as the first parameter
   * @param {Object} [logger]
   * @param {Boolean} useTransaction Defaults to true
   * @return {Promise} The value returned by task(), if the database connection
   *     is successful
   * @throws {Error} The error caught while:
   *   1. connecting to the database
   *   2. starting a transaction
   *   3. await task()
   *   4. committing the transaction
   */
  async connect(task, logger, useTransaction = true) {
    if (this.stopped) throw new Error('Stopped');

    if (logger) logger = logger.logger('MySql');

    // Loop until connectRetryTimeout is reached. Loop at least once.
    const stopTime = Date.now() + this.connectRetryTimeout;
    let delayMs = 500;

    for (let first = true; ; first = false) {
      let connection;
      let inTransaction;

      try {
        // 'connection' will be usable if an exception is not thrown
        // eslint-disable-next-line no-await-in-loop
        connection = await (this.usePool
          ? this.connectionPool.getConnection()
          : mysql2.createConnection(this.connectOptions));
        // throw new Error('Test scenario 3 - Begin fails');
        if (useTransaction) {
          // eslint-disable-next-line no-await-in-loop
          await connection.beginTransaction();
        } else {
          // Test the connection
          // eslint-disable-next-line no-await-in-loop
          await connection.query('SELECT 1');
        }
        inTransaction = true;
        // throw new Error('Test scenario 4 - App fails');
        // eslint-disable-next-line no-await-in-loop
        const ret = await task(connection);
        // throw new Error('Test scenario 1 - Commit fails');
        // eslint-disable-next-line no-await-in-loop
        if (useTransaction) await connection.commit();
        return ret;
      } catch (error) {
        {
          const { host, port, user, database, ssl } = this.connectOptions;
          const { useIAM } = this;
          error.options = {
            host,
            user,
            port,
            database,
            ssl,
            useIAM,
          };
        }

        if (inTransaction) {
          // Application error or commit failed
          if (useTransaction) {
            try {
              if (logger) {
                logger.warn({
                  message: `Rollback transaction on '${this.connectOptions.host}'`,
                  host: this.connectOptions.host,
                  error,
                });
              }
              // throw new Error('Test scenario 2 - Rollback fails');
              // eslint-disable-next-line no-await-in-loop
              await connection.rollback();
            } catch (error2) {
              if (logger) {
                logger.error({
                  message: `Rollback transaction failed on '${this.connectOptions.host}'`,
                  host: this.connectOptions.host,
                  error: error2,
                });
              }
              if (this.usePool) {
                try {
                  connection.destroy();
                } catch (error3) {
                  if (logger) {
                    logger.error({
                      message: `Destroying connection failed on '${this.connectOptions.host}'`,
                      host: this.connectOptions.host,
                      error: error3,
                    });
                  }
                }
              }
            }
          }
          throw error;
        }

        if (connection) {
          // Begin transaction failed; close the connection and try again
          // without waiting
          if (logger) {
            logger.error({
              message: `Dead connection detected on '${this.connectOptions.host}'`,
              host: this.connectOptions.host,
              error,
            });
          }
          if (this.usePool) {
            try {
              connection.destroy();
            } catch (error2) {
              if (logger) {
                logger.error({
                  message: `Destroying connection failed on '${this.connectOptions.host}'`,
                  host: this.connectOptions.host,
                  error: error2,
                });
              }
            }
          }
          // eslint-disable-next-line no-continue
          continue;
        }

        // Unable to acquire a connection
        const now = Date.now();
        if (!first && now > stopTime) {
          Object.assign(error, {
            host: this.connectOptions.host,
            port: this.connectOptions.port,
            user: this.connectOptions.user,
            database: this.connectOptions.database,
          });
          throw error;
        }

        // @todo replace this with backoff package
        delayMs = Math.min(delayMs * 2, this.maxConnectDelay);

        // Poor man's jitter
        {
          let delta = Math.floor(Math.random() * (delayMs / 100));
          if (Math.random(2) < 0.5) delta = -delta;
          delayMs += delta;
        }

        if (logger) {
          const { host, port, user, database, ssl } = this.connectOptions;
          const { useIAM } = this;

          logger.warn({
            message: `Waiting ${humanizeDuration(delayMs)} for '${user}@${host}:${port}/${database}' IAM: ${useIAM}`,
            host,
            user,
            port,
            database,
            ssl,
            useIAM,
            error,
          });
        }

        const delay = delayMs;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        if (connection) {
          try {
            // throw new Error('Test scenario 6 - Release fails');
            // eslint-disable-next-line no-await-in-loop
            await (this.usePool ? connection.release() : connection.end());
          } catch (error) {
            if (logger) {
              logger.error({
                message: `Releasing connection failed on '${this.connectOptions.host}'`,
                host: this.connectOptions.host,
                error,
              });
            }
          }
        }
      }
    }
  }
}

module.exports = MySql;

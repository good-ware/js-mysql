/* eslint-disable no-param-reassign */
/* eslint-disable no-await-in-loop */

const humanizeDuration = require('humanize-duration');
const Joi = require('joi');
const mysql2 = require('mysql2/promise');
const parseDuration = require('parse-duration');

let RDS;
let noAwsSdk;

/* Testing
 *
 * There are currently no unit tests. Instead, only whitebox testing is performed manually via uncommenting code. Search
 * for "Test scenario".
 */
/* TODO: (#6)
 * In order for decimals to be returned as numbers instead of strings, add an option and add this code conditionally.
 * See https://github.com/sidorares/node-mysql2/issues/795 I tried this when creating a new connection but it didn't
 * work:
 *
 * typeCast: (field, next) => {
 *   if (field.type === "DECIMAL") {
 *     const value = field.string();
 *     return (value === null) ? null : Number(value);
 *   }
 *   return next();
 * }
 */

/**
 * @description Schema for the 'options' object passed to MySqlConnector's constructor. See also
 * [mysql pool options](https://github.com/mysqljs/mysql#pool-options).
 */
const optionsSchema = Joi.object({
  connectionLimit: Joi.number().integer().min(0).default(10).description(`The maximum number of connections to keep \
in the connection pool when usePool is true`),
  connectTimeout: Joi.alternatives(Joi.number().min(0), Joi.string())
    .default(10000)
    .description('The amount of time (converted to milliseconds), to wait for one database connection request'),
  connectRetryTimeout: Joi.alternatives(Joi.number().min(0), Joi.string())
    .default(5 * 60 * 1000)
    // eslint-disable-next-line no-multi-str
    .description(
      // eslint-disable-next-line no-multi-str
      'The amount of time (converted to milliseconds), to wait for a successful database connection \
(including retries)'
    ),
  database: Joi.string().default('mysql').description('Which database (aka schema) to connect to'),
  enableKeepAlive: Joi.boolean().description(`Used when usePool is true. When this value is true, pooled connections \
are periodically discarded if they are no longer alive, which also causes them to stay alive.`),
  host: Joi.string().default('0.0.0.0').description('The database server host name'),
  keepAliveInitialDelay: Joi.alternatives(Joi.number().min(0), Joi.string()).default(10000).description(`Used when \
enableKeepAlive is true and specifies how frequently (converted to milliseconds) connections are checked.`),
  logger: Joi.alternatives(Joi.object(), Joi.function()).description('A logger object or function'),
  // eslint-disable-next-line quotes
  maxConnectDelay: Joi.alternatives(Joi.number().min(0), Joi.string())
    .default(100000)
    .description(
      `The maximum amount of time (converted to milliseconds) to wait between connection attempts. It starts at 10 ms \
and increases exponentially.`
    ),
  multipleStatements: Joi.boolean().description(`true enables mysql2 connections to run multiple statements (separated \
by seicolons) via one call to query(), execute(), etc.`),
  password: Joi.string().allow('').description(`The password for the database user. Ignored when useIAM is
true.`),
  port: Joi.number().integer().default(3306).description('The database server port number'),
  queueLimit: Joi.number().integer().min(0).default(0).description(`The maximum command queue size for one mysql2 \
connection`),
  region: Joi.when('useIAM', {
    is: true,
    then: Joi.string().required(),
  }).description('Used when useIAM is true. The AWS region name.'),
  ssl: Joi.string().description(`Typically 'Amazon RDS'`),
  useIAM: Joi.boolean().description('true to use AWS RDS IAM passwordless security'),
  user: Joi.string().default('root').allow('').description('The database user name'),
  usePool: Joi.boolean().description('true enables connection pooling'),
});

/**
 * @private
 * @ignore
 * @description This tag is always logged
 */
const logTag = 'db';

/**
 * @private
 * @ignore
 * @description Logs a message
 * @param {Object | Function} logger
 * @param {String[]} tags
 * @param {Object} message
 */
function log(logger, tags, message) {
  if (typeof logger === 'object') {
    logger.log(tags, message);
  } else {
    logger(tags, message);
  }
}

/**
 * @description Creates mysql2-promise Connection objects, optionally from a pool. If a database connection can not be
 * acquired due to a timeout specified via the 'connectTimeout' options setting, the methods try again using exponential
 * backoff with jitter until the 'connectRetryTimeout' options setting is exceeded. All duration-related options values
 * can be provided as either numbers (milliseconds, including fractions) or as string values that are supported by
 * [parse-duration](https://www.npmjs.com/package/parse-duration).
 */
class MySqlConnector {
  /**
   * Properties:
   *   {Object} connectOptions
   *   {Boolean} usePool
   *   {Boolean} useIAM
   *   {Object} connectionPool
   *   {Number} maxConnectDelay
   *   {Number} connectRetryTimeout
   *   {Boolean} stopped
   */
  /**
   * @constructor
   * @description Optionally call connect() afterward to check whether a connection can be acquired. See also
   * [mysql pool options](https://github.com/mysqljs/mysql#pool-options).
   * @param {Object} [options] Constructor options. Defaults are used if the provided value is falsy.
   * @param {Integer} [options.connectionLimit] The maximum number of connections to keep in the connection pool when
   *   usePool is true. Defaults to 10 connections.
   * @param {Number|String} [options.connectTimeout] The amount of time (converted to milliseconds), to wait for one
   *   database connection request
   * @param {Number|String} [options.connectRetryTimeout] The amount of time (converted to milliseconds), to wait for a
   *   successful database connection (including retries). Defaults to 5 minutes.
   * @param {String} [options.database] Which database (aka schema) to connect to. Defaults to mysql.
   * @param {Boolean} [options.enableKeepAlive] Used when usePool is true. When this value is true, pooled connections
   *   are periodically discarded if they are no longer alive, which also causes them to stay alive.
   * @param {String} [options.host] The database server host name. Defaults to 0.0.0.0.
   * @param {Number|String} [options.keepAliveInitialDelay] Used when enableKeepAlive is true and specifies how
   *   frequently (converted to milliseconds) connections are checked. Defaults to 10 seconds.
   * @param {Function|Object} [options.logger] A logger object or function. Can also be provided as the second
   *   parameter.
   * @param {Number|String} [options.maxConnectDelay] The maximum amount of time (converted to milliseconds) to wait
   *   between connection attempts. It starts at 10 ms and increases exponentially. Defaults to 100 seconds.
   * @param {Boolean} [options.multipleStatements] true enables mysql2 connections to run multiple statements (separated
   *   by seicolons) via one call to query(), execute(), etc.
   * @param {String} [options.password] The password for the database user. Ignored when useIAM is true.
   * @param {String} [options.port] The database server port number. Defaults to 3306.
   * @param {Integer} [options.queueLimit] The maximum command queue size for one mysql2 connection
   * @param {String} [options.region] Used when useIAM is true. The AWS region name.
   * @param {String} [options.ssl] Typically 'Amazon RDS' when needed
   * @param {Boolean} [options.useIAM] true to use AWS RDS IAM passwordless security
   * @param {String} [options.user] The database user name. Defaults to root.
   * @param {Boolean} [options.usePool] true enables connection pooling
   * @param {Function|Object} logger A logger object or function. Can also be provided via options.logger.
   */
  constructor(options, logger) {
    if (!options) options = {};
    if (logger && !options.logger) options = { ...options, logger };
    const validation = optionsSchema.validate(options);
    if (validation.error) throw new Error(validation.error.message);
    options = validation.value;

    ['connectTimeout', 'connectRetryTimeout', 'keepAliveInitialDelay', 'maxConnectDelay'].forEach((key) => {
      const value = options[key];
      if (typeof value === 'number') return;
      const newValue = parseDuration(value);
      if (newValue === null || newValue < 0) throw new Error(`Invalid duration for '${key}': ${value}`);
      options[key] = newValue;
    });

    const { region, host, port, user, useIAM, usePool } = options;

    // These are sent to mysql2. Only add properties supported by mysql2.
    const connectOptions = {
      host,
      port,
      user,
      database: options.database,
      connectTimeout: options.connectTimeout,
      multipleStatements: options.multipleStatements,
    };

    if (options.ssl !== undefined) connectOptions.ssl = options.ssl;

    if (useIAM && !RDS && !noAwsSdk) {
      try {
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        RDS = require('aws-sdk/clients/rds');
      } catch (error) {
        noAwsSdk = true;
        // eslint-disable-next-line no-console
        console.error(`RDS IAM login requested but aws-sdk is not installed: ${error.message}`);
      }
    }

    if (useIAM && RDS) {
      // See
      // https://stackoverflow.com/questions/58067254/node-mysql2-aws-rds-signer-connection-pooling/60013378#60013378
      const signer = new RDS.Signer();
      // eslint-disable-next-line require-jsdoc
      const iamTokenPlugin = () => () =>
        // Only reference local variables in this lambda (no other objects)
        signer.getAuthToken({
          region,
          hostname: host,
          port,
          username: user,
        });

      connectOptions.authPlugins = { mysql_clear_password: iamTokenPlugin };
    } else {
      connectOptions.password = options.password;
    }

    // Initialization that doesn't require async
    Object.assign(this, {
      connectOptions,
      logger: options.logger,
      usePool,
      useIAM,
      maxConnectDelay: options.maxConnectDelay,
      connectRetryTimeout: options.connectRetryTimeout,
      stopped: false,
    });

    if (usePool) {
      Object.assign(connectOptions, {
        connectionLimit: options.connectionLimit,
        queueLimit: options.queueLimit,
        // acquireTimeout is not yet supported by mysql2
        // acquireTimeout: options.acquireTimeout
        enableKeepAlive: options.enableKeepAlive,
        keepAliveInitialDelay: options.keepAliveInitialDelay,
      });

      this.connectionPool = mysql2.createPool(connectOptions);
    }
  }

  /**
   * @description Closes the connection pool. Subsequent calls to connect(), execute(), and transaction() will fail.
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
   * @description Checks the database connection
   * @param {Object} [logger]
   * @return {Promise} Resolves to true or rejects in case of connection failure
   */
  connect(logger) {
    return this.connectForTask((connection) => {
      connection.query('SELECT 1');
      return true;
    }, logger);
  }

  /**
   * @description Acquires a database connection and invokes a function that accepts a mysql2 Connection object. Each
   * call to connection.query() etc. is run in a separate transaction.
   * @param {Function} task A function that accepts a mysql2 connection object as the first parameter and logger as the
   * second
   * @param {Object} [logger]
   * @return {Promise} Resolves to the value returned by task(), if the database connection is successful
   * @throws {Error} The error caught while:
   * 1. connecting to the database
   * 2. await task()
   */
  execute(task, logger) {
    return this.connectForTask(task, logger, false);
  }

  /**
   * @description Acquires a database connection, begins a transaction on that connection, invokes a function that
   * accepts a mysql2 Connection object that uses a shared transaction, and either commits or rolls back the
   * transaction, depending on whether the function throws an exception.
   * @param {Function} task A function that accepts a mysql2 connection object as the first parameter and logger as the
   * second
   * @param {Object} [logger]
   * @return {Promise} Resolves to the value returned by task(), if the database connection is successful
   * @throws {Error} The error caught while:
   * 1. connecting to the database
   * 2. starting a transaction
   * 3. await task()
   * 4. committing the transaction
   */
  transaction(task, logger) {
    return this.connectForTask(task, logger);
  }

  /**
   * @private
   * @ignore
   * @description Acquires a database connection and invokes a function
   * @param {Function} task A function that accepts a mysql2 connection object as the first parameter
   * @param {Object} [logger]
   * @param {Boolean} useTransaction Defaults to true
   * @return {Promise} Resolves to the value returned by task(), if the database connection is successful
   * @throws {Error} The error caught while:
   * 1. connecting to the database
   * 2. starting a transaction
   * 3. await task()
   * 4. committing the transaction
   */
  async connectForTask(task, logger, useTransaction = true) {
    if (this.stopped) throw new Error('Stopped');
    if (!logger) logger = this.logger;

    // Loop until connectRetryTimeout is reached. Loop at least once.
    const stopTime = Date.now() + this.connectRetryTimeout;
    let delayMs = 500;

    for (let first = true; ; first = false) {
      let connection;
      let inTransaction;

      try {
        // 'connection' will be usable if an exception is not thrown
        connection = await (this.usePool
          ? this.connectionPool.getConnection()
          : mysql2.createConnection(this.connectOptions));
        // throw new Error('Test scenario 3 - Begin fails');
        if (useTransaction) {
          await connection.beginTransaction();
        } else if (this.usePool) {
          // Test the connection for staleness
          await connection.query('SELECT 1');
        }
        inTransaction = true;
        // throw new Error('Test scenario 4 - App fails');
        const ret = await task(connection, logger);
        // throw new Error('Test scenario 1 - Commit fails');
        if (useTransaction) await connection.commit();
        return ret;
      } catch (error) {
        {
          const { host, port, user, database, ssl } = this.connectOptions;
          const { useIAM } = this;
          error.options = JSON.stringify({
            host,
            user,
            port,
            database,
            ssl,
            useIAM,
          });
        }

        if (inTransaction) {
          // Application error or commit failed
          if (useTransaction) {
            try {
              if (logger) {
                log(logger, ['warn', logTag], {
                  message: `Rollback transaction on '${this.connectOptions.host}'`,
                  error,
                });
              }
              // throw new Error('Test scenario 2 - Rollback fails');
              await connection.rollback();
            } catch (error2) {
              if (logger) {
                log(logger, ['error', logTag], {
                  message: `Rollback transaction failed on '${this.connectOptions.host}'`,
                  error: error2,
                });
              }
              if (this.usePool) {
                try {
                  connection.destroy();
                } catch (error3) {
                  if (logger) {
                    log(logger, ['warn', logTag], {
                      message: `Destroying connection failed on '${this.connectOptions.host}'`,
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
            log(logger, ['warn', logTag], {
              message: `Dead connection detected on '${this.connectOptions.host}'`,
              error,
            });
          }
          if (this.usePool) {
            try {
              connection.destroy();
            } catch (error2) {
              if (logger) {
                log(logger, ['warn', logTag], {
                  message: `Destroying connection failed on '${this.connectOptions.host}'`,
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
          const { host, port, user, database } = this.connectOptions;

          log(logger, ['warn', logTag], {
            message: `Waiting ${humanizeDuration(delayMs)} for '${user}@${host}:${port}/${database}'`,
            error,
          });
        }

        const delay = delayMs;
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      } finally {
        if (connection) {
          try {
            // throw new Error('Test scenario 6 - Release fails');
            // this.connectionPool.releaseConnection(connection) doesn't work despite what mysql2's README says
            if (this.usePool) connection.release();
            else await connection.end();
          } catch (error) {
            if (logger) {
              log(logger, ['error', logTag], {
                message: `Releasing connection failed on '${this.connectOptions.host}'`,
                error,
              });
            }
          }
        }
      }
    }
  }
}

module.exports = MySqlConnector;

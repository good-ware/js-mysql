# @goodware/mysql: A mysql2-promise helper

## Links

- [Release History](https://good-ware.github.io/js-mysql/tutorial-CHANGELOG)
- [npm](https://www.npmjs.com/package/@goodware/mysql)
- [git](https://github.com/good-ware/js-mysql)
- [API](https://good-ware.github.io/js-mysql/)

## Requirements

- NodeJS 8+

## Features

- Creates database connections via mysql2-promise, optionally from a pool, with exponential backoff retry
- Handles AWS RDS MySQL IAM passwordless connections
- Supports AWS RDS MySQL SSL
- Optionally manages database transactions by wrapping begin and end transaction commands around a function invocation, with an exception handler that executes rollback
- Same API whether using connection pooling or individual connections
- Same API whether using explicit or implicit transactions

## Installation

`npm i --save @goodware/mysql`

## Usage

1. Create an instance of the MySqlConnection class (it is the default export)
2. Call execute() or transaction() which accept a function that accepts a mysql2-promise Connection.
3. If you're using connection pooling, call stop() to close the connections in the pool. This is necessary if:

- The app instantiates multiple instances to access the same database server. It is recommended to use a single global instance to avoid this issue.
- The app hangs instead of terminating

## Logger

The options provided by the constructor and all other methods accept an optional 'logger' function or object. If an object is provided, it must have the method log().

```js
interface Logger {
  /**
   * @param tags Typically includes a logging level name, like info or debug.
   * @param message An object with at least a message property
   */
  log(tags: string[] | string, message: Record<string, unknown>): void;
}
```

## Example

The following program outputs 'success' to the console.

```js
const mysql = require('@goodware/mysql');

const config = {
  // host: '0.0.0.0', // This is the default
  // port: 3306, // This is the default
  // user: 'root', // This is the default
  // database: 'mysql', // This is the default
  password: 'password',
  usePool: true, // Defaults to 10 connections (see connectionLimit in constructor options)
};

async () => {
  const connector = new mysql(config, console.log); // The second parameter is a logger function
  // Acquire a database connection
  const result = await connector.execute( async (connection) => {
    // Perform database operations
    const [results] = await connection.query(`select 'success' AS status`);
    // The Promise resolves to 'success'
    return results[0].status;
  });
  // Close all database connections in the pool
  await connector.stop();
  // The Promise resolves to 'success'
  return result;
}().then(console.info, console.error);
```

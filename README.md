# @goodware/mysql: A mysql2-based connection helper

Better documentation is coming

# Links

- [npm](https://www.npmjs.com/package/@goodware/mysql)
- [git](https://github.com/good-ware/js-mysql)
- [API](https://good-ware.github.io/js-mysql/)

# Requirements

ES 2017

# Installation

`npm i --save @goodware/mysql`

## Breaking change! Peer dependencies for versions 3+

All runtime dependencies in version 3 were changed to use peer dependencies.

If you're missing a dependency, you have three options:

1. Stick with version 2.x

npm i --save @goodware/mysql@2

Or, in package.json dependencies:

`"@goodware/mysql": "^2.0.0"`

2. Add the missing dependencies to your package.json
3. upgrade to npm version 7

```shell
npm i -g npm@7
```

# Features

- Creates database connections via mysql2-promise, optionally from a pool, with exponential backoff retry
- Handles AWS RDS passwordless IAM connections
- Manages database transactions by wrapping begin/end around a function invocation

# Notes

- mysql2 Connection objects are from mysql2-promise, so their methods execute(), query() etc. return Promises.
- If usePool is true, "await stop()" must be called on the MySqlConnector object if you wish to release the connections
  in the pool. **Letting these objects go out of scope without stopping them will not close the connections.**

# Usage

1. Create an instance of the class that is exported by this module
2. Call exectue() or transaction(). These accept a function that accepts a mysql2 connection object. The provided functions usually call query() on the connection object.
3. If you're using connection pooling, call stop() to close all connections. This is necessary if:

  - The app instantiates multiple instances to access the same database server. It is recommended to use a single global instance to avoid this issue.
  - The app hangs when exiting

# Logger

The options provided by the constructor and all other methods accept an optional 'logger' function or object. If an object is provided, it must have the method log():

```js
interface Logger {
  /**
   * @param tags Typically includes a logging level name, like info or debug.
   * @param message An object with at least a message property
   */
  log(tags: string[] | string, message: Record<string, unknown>): void;
}
```

# Usage

The following program outputs 'success' to the console.

```js
const mysql = require('@goodware/mysql');
const pack = require('../package.json');

const config = {
  // host: '0.0.0.0', // This is the default
  // port: 3306, // This is the default
  // user: 'root', // This is the default
  // database: 'mysql', // Ths is the default
  password: 'password',
};

const connector = new mysql(config, console.log); // The second parameter is a logger function

async () => {
  const result = await connector.execute( async (connection) => {
    const [results] = await connection.query(`select 'success' AS status`);
    return results[0].status;
  });
  console.log(result);
  await connector.stop();
}().then(console.info, console.error);
```


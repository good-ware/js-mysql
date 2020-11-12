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

# Features

- Creates database connections via mysql2-promise, optionally from a pool, with exponential backoff retry
- Handles AWS RDS passwordless IAM connections
- Manages database transactions by wrapping begin/end around a function invocation

# Notes

- mysql2 Connection objects are from mysql2-promise, so their methods execute(), query() etc. return Promises.
- If usePool is true, "await stop()" must be called on the MySqlConnector object if you wish to release the connections
  in the pool. **Letting these objects merely go out of scope without stopping them will not close the connections.**

# Example

The following program outputs 'success' to the console.

```js
const mysql = require('@goodware/mysql');
const pack = require('../package.json');

const config = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: process.env.DB_PASSWORD,
  database: 'mydb',
};

const connector = new mysql(config);

async () => {
  await connector.execute( async () => {
    const [results] = await connection.query(`select 'success' AS column`);
    console.log(results[0]).column;
  });

  await connector.stop();
}().then(console.info, console.error);
```

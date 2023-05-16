module.exports = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  region: process.env.DB_AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION,
  ssl: process.env.DB_SSL, // 'Amazon RDS',
  useIAM: true
};

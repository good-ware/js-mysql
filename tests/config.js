module.exports = {
  host: process.env.DB_HOST || '0.0.0.0',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'mysql',
  region: process.env.DB_AWS_REGION || process.env.AWS_DEFAULT_REGION,
  ssl: process.env.DB_SSL,
  useIAM: process.env.DB_USE_IAM,
};

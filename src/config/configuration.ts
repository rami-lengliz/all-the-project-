export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    name: process.env.DATABASE_NAME || 'rental_platform',
  },
  jwt: {
    secret:
      process.env.JWT_SECRET ||
      'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  },
  refreshToken: {
    secret:
      process.env.REFRESH_TOKEN_SECRET ||
      'your-super-secret-refresh-token-key-change-in-production',
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  ml: {
    serviceUrl: process.env.ML_SERVICE_URL || 'http://ml-service:8000',
  },
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
  },
  commission: {
    percentage: parseFloat(process.env.COMMISSION_PERCENTAGE || '0.10'), // 10% default
  },
});

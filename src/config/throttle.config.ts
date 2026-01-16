import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL || '60', 10), // seconds
  limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10), // requests per TTL
  authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT || '5', 10), // auth endpoints
  bookingLimit: parseInt(process.env.THROTTLE_BOOKING_LIMIT || '10', 10), // booking endpoints
}));

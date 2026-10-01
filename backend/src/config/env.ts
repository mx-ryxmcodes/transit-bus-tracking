import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be >= 32 chars'),
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(14),
  CORS_ORIGIN: z.string().default('http://localhost:3000'), // comma-separated, used by Socket.IO
  APP_TZ: z.string().default('Asia/Karachi'),                // drives peak-hour factor + "today" analytics
  STALE_SIGNAL_SECONDS: z.coerce.number().default(30),       // no valid GPS ping for this long => LOCATION_UNAVAILABLE
});
export const env = schema.parse(process.env);

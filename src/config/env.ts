import { z } from 'zod';

/**
 * Toda la configuración sale de aquí. Si falta o está mal una variable, la API
 * no arranca (fail-closed) y dice cuál es.
 */
const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const csv = (def: string) =>
  z
    .string()
    .default(def)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  // Solo hace falta si el front se sirve desde OTRO origen. Con el proxy de Vite
  // (desarrollo) o de nginx (Dokploy) el front y la API comparten origen.
  CORS_ORIGIN: z.string().default(''),

  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_SSL: bool,

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_PASSWORD: z.string().default(''),

  // Mismos instrumentos que produccion.activos de config.yaml
  PAIRS: csv('EUR_USD,USD_JPY,XAU_USD'),
  GRANULARITY: z.string().default('H1'),
  // Zona horaria para agrupar por día (los reportes del sistema usan hora de Ecuador)
  DISPLAY_TZ: z.string().default('America/Guayaquil'),
  // Igual que shared.models.SIDE_STRATEGIES: se cuentan aparte del modelo
  SIDE_STRATEGIES: csv('prueba,practica'),

  AUTH_USERNAME: z.string().min(3),
  // Hash bcrypt codificado en base64 (sin '$', así no lo rompe docker compose).
  // Generarlo con: npm run hash-password
  AUTH_PASSWORD_HASH_B64: z
    .string()
    .min(20)
    .transform((v) => Buffer.from(v, 'base64').toString('utf8'))
    .refine((v) => /^\$2[aby]\$\d{2}\$/.test(v), {
      message: 'No es un hash bcrypt en base64 (usa npm run hash-password)',
    }),
  JWT_SECRET: z.string().min(32, 'Mínimo 32 caracteres'),
  SESSION_HOURS: z.coerce.number().positive().max(168).default(12),
  // true en producción (HTTPS). En local por http tiene que ser false.
  COOKIE_SECURE: bool,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en el .env:\n${detalle}`);
  }
  return parsed.data;
}

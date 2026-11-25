import { validateEnv } from './env';

const hashB64 = Buffer.from(
  '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
).toString('base64');

export const baseEnv = {
  POSTGRES_HOST: 'db',
  POSTGRES_DB: 'trading',
  POSTGRES_USER: 'dashboard_ro',
  POSTGRES_PASSWORD: 'x',
  REDIS_HOST: 'redis',
  AUTH_USERNAME: 'misael',
  AUTH_PASSWORD_HASH_B64: hashB64,
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('aplica los valores por defecto y convierte tipos', () => {
    const env = validateEnv(baseEnv);
    expect(env.PORT).toBe(3001);
    expect(env.PAIRS).toEqual(['EUR_USD', 'USD_JPY', 'XAU_USD']);
    expect(env.SIDE_STRATEGIES).toEqual(['prueba', 'practica']);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.AUTH_PASSWORD_HASH_B64.startsWith('$2b$12$')).toBe(true);
  });

  it('no arranca si falta un secreto o es débil, y dice cuál', () => {
    expect(() => validateEnv({ ...baseEnv, JWT_SECRET: 'corto' })).toThrow(
      /JWT_SECRET/,
    );
    const sinHost: Record<string, string> = { ...baseEnv };
    delete sinHost.POSTGRES_HOST;
    expect(() => validateEnv(sinHost)).toThrow(/POSTGRES_HOST/);
  });

  it('rechaza un hash que no es bcrypt', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        AUTH_PASSWORD_HASH_B64: Buffer.from('mi-contraseña-en-claro').toString(
          'base64',
        ),
      }),
    ).toThrow(/AUTH_PASSWORD_HASH_B64/);
  });
});

import * as bcrypt from 'bcryptjs';

// Se carga antes que AppModule: ConfigModule valida el entorno al importarse.
Object.assign(process.env, {
  NODE_ENV: 'test',
  POSTGRES_HOST: 'db',
  POSTGRES_DB: 'trading',
  POSTGRES_USER: 'ro',
  POSTGRES_PASSWORD: 'x',
  REDIS_HOST: 'redis',
  AUTH_USERNAME: 'misael',
  AUTH_PASSWORD_HASH_B64: Buffer.from(
    bcrypt.hashSync('contraseña-de-prueba', 4),
  ).toString('base64'),
  JWT_SECRET: 'b'.repeat(40),
});

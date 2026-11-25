import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { StreamReaderService } from '../src/live/stream-reader.service';
import { RedisService } from '../src/redis/redis.service';

/** Arranca la API con la BD y Redis simulados: prueba login, sesión y filtros. */
describe('API (e2e)', () => {
  let app: INestApplication<App>;
  const queries: { sql: string; params: unknown[] }[] = [];

  // El entorno de prueba (usuario misael / contraseña-de-prueba) está en setup-env.ts
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        query: (sql: string, params: unknown[] = []) => {
          queries.push({ sql, params });
          return Promise.resolve(
            sql.includes('COUNT(*)::int AS n') ? [{ n: 0 }] : [],
          );
        },
        ping: () => Promise.resolve(true),
      })
      .overrideProvider(RedisService)
      .useValue({
        getJson: () => Promise.resolve({ balance: 10000, equity: 10000 }),
        ping: () => Promise.resolve(true),
      })
      .overrideProvider(StreamReaderService)
      .useValue({ events$: { subscribe: () => ({ unsubscribe: () => {} }) } })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();
  });

  afterAll(() => app.close());

  it('health es público', () =>
    request(app.getHttpServer()).get('/api/health').expect(200));

  it('sin sesión no da datos', () =>
    request(app.getHttpServer()).get('/api/trades').expect(401));

  it('contraseña incorrecta: 401 y sin cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'misael', password: 'mala' })
      .expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login correcto da cookie httpOnly y abre los datos', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'misael', password: 'contraseña-de-prueba' })
      .expect(200);
    const raw = login.headers['set-cookie'] as unknown as string[];
    const cookie = raw[0];
    expect(cookie).toMatch(/td_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200, { username: 'misael' });

    queries.length = 0;
    await request(app.getHttpServer())
      .get('/api/trades?group=modelo&mode=sim&limit=10')
      .set('Cookie', cookie)
      .expect(200, { total: 0, rows: [] });
    // Los valores van como parámetros, nunca dentro del SQL
    expect(queries[0].params).toEqual(['sim', ['prueba', 'practica'], 10, 0]);

    await request(app.getHttpServer())
      .get('/api/chart?pair=EUR_USD;DROP')
      .set('Cookie', cookie)
      .expect(400);
  });
});

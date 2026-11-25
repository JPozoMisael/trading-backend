import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis, RedisOptions } from 'ioredis';
import { AppConfig } from '../config/app-config.service';

/**
 * Lectura del Redis del sistema de trading.
 *
 * Nunca escribe y nunca usa grupos de consumidores (XREADGROUP): un grupo nuevo
 * o un XACK podría quitarle mensajes a los servicios de Python. Los streams se
 * leen con XREAD simple, que no cambia nada en Redis.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  private readonly options: RedisOptions;
  /** Para GET y PING. */
  readonly client: Redis;

  constructor(config: AppConfig) {
    this.options = {
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      db: config.get('REDIS_DB'),
      password: config.get('REDIS_PASSWORD') || undefined,
      connectTimeout: 5_000,
      lazyConnect: false,
    };
    // Consultas: si Redis no responde en 3 s, error (la API nunca queda colgada).
    this.client = this.connect('consultas', {
      maxRetriesPerRequest: 1,
      commandTimeout: 3_000,
    });
  }

  /** Conexión aparte para lecturas bloqueantes (XREAD BLOCK no comparte conexión ni lleva timeout). */
  createClient(nombre: string): Redis {
    return this.connect(nombre, { maxRetriesPerRequest: null });
  }

  private connect(nombre: string, extra: RedisOptions): Redis {
    const c = new Redis({ ...this.options, ...extra });
    c.on('error', (e) => this.log.warn(`Redis (${nombre}): ${e.message}`));
    return c;
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}

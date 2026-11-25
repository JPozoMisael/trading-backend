import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, QueryResultRow, types } from 'pg';
import { AppConfig } from '../config/app-config.service';

// Las vistas usan ROUND(...)::numeric y los ids son BIGINT: pg los devuelve como
// texto. Aquí todo es lectura para mostrar, así que se convierten a número.
types.setTypeParser(types.builtins.NUMERIC, (v) => parseFloat(v));
types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10));

/**
 * Acceso a la BD del sistema de trading, SOLO LECTURA.
 *
 * Barrera 1: cada sesión se abre con default_transaction_read_only=on, así que
 * Postgres rechaza cualquier INSERT/UPDATE/DELETE aunque el usuario tuviera permiso.
 * Barrera 2 (recomendada): usar un usuario con solo SELECT (sql/usuario_solo_lectura.sql).
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      host: config.get('POSTGRES_HOST'),
      port: config.get('POSTGRES_PORT'),
      database: config.get('POSTGRES_DB'),
      user: config.get('POSTGRES_USER'),
      password: config.get('POSTGRES_PASSWORD'),
      ssl: config.get('POSTGRES_SSL') ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
      application_name: 'trading-dashboard-api',
      options: '-c default_transaction_read_only=on',
    });
    this.pool.on('error', (e) =>
      this.log.error(
        `Error en una conexión inactiva de Postgres: ${e.message}`,
      ),
    );
  }

  async onModuleInit() {
    // No se bloquea el arranque si la BD no está: /api/health lo mostrará.
    try {
      await this.ping();
      this.log.log('Conectado a Postgres (solo lectura)');
    } catch (e) {
      this.log.warn(
        `Postgres no responde al arrancar: ${(e as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const res = await this.pool.query<T>(sql, params);
    return res.rows;
  }

  async ping(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }
}

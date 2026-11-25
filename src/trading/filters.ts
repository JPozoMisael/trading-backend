import { z } from 'zod';

export const PAIR_RE = /^[A-Z0-9]{3,6}_[A-Z0-9]{3,6}$/;
export const GRANULARITIES = [
  'M1',
  'M5',
  'M15',
  'M30',
  'H1',
  'H4',
  'D',
  'D1',
  'W1',
] as const;

/**
 * - modelo: lo que opera el modelo (lo que cuenta para decidir con dinero real)
 * - practica / prueba: operaciones laterales, solo simulación, contadas aparte
 */
export const groupSchema = z
  .enum(['modelo', 'practica', 'prueba', 'todos'])
  .default('modelo');
/** Nunca mezclar simulación con cuenta MT5: engaña (igual que las vistas de la BD). */
export const modeSchema = z.enum(['sim', 'mt5']).default('sim');

export type Group = z.infer<typeof groupSchema>;
export type Mode = z.infer<typeof modeSchema>;

export const pairSchema = z
  .string()
  .regex(PAIR_RE, 'Par inválido (ej. EUR_USD)');

/** Arma un WHERE con parámetros numerados ($1, $2...) sin concatenar valores. */
export class Where {
  private readonly parts: string[] = [];
  readonly params: unknown[] = [];

  add(sqlConPlaceholder: string, ...values: unknown[]): this {
    let sql = sqlConPlaceholder;
    for (const v of values) {
      this.params.push(v);
      sql = sql.replace('?', `$${this.params.length}`);
    }
    this.parts.push(sql);
    return this;
  }

  /** Siguiente placeholder libre (para LIMIT/OFFSET después del WHERE). */
  next(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  group(group: Group, sideStrategies: string[], col = 'strategy_name'): this {
    if (group === 'modelo')
      return this.add(`NOT (COALESCE(${col}, '') = ANY(?))`, sideStrategies);
    if (group === 'practica') return this.add(`${col} = 'practica'`);
    if (group === 'prueba') return this.add(`${col} = 'prueba'`);
    return this;
  }

  toString(): string {
    return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
  }
}

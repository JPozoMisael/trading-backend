import { Where } from './filters';

describe('Where', () => {
  const side = ['prueba', 'practica'];

  it('numera los parámetros en orden y no concatena valores', () => {
    const w = new Where()
      .add(`status = 'closed'`)
      .add('execution_mode = ?', 'sim')
      .add('pair = ?', "EUR_USD'; DROP TABLE orders; --");
    expect(w.toString()).toBe(
      `WHERE status = 'closed' AND execution_mode = $1 AND pair = $2`,
    );
    expect(w.params).toEqual(['sim', "EUR_USD'; DROP TABLE orders; --"]);
  });

  it('modelo excluye las estrategias laterales', () => {
    const w = new Where().group('modelo', side, 'o.strategy_name');
    expect(w.toString()).toBe(
      `WHERE NOT (COALESCE(o.strategy_name, '') = ANY($1))`,
    );
    expect(w.params).toEqual([side]);
  });

  it('práctica y prueba filtran por su nombre; todos no filtra', () => {
    expect(new Where().group('practica', side).toString()).toBe(
      `WHERE strategy_name = 'practica'`,
    );
    expect(new Where().group('prueba', side).toString()).toBe(
      `WHERE strategy_name = 'prueba'`,
    );
    expect(new Where().group('todos', side).toString()).toBe('');
  });

  it('next() continúa la numeración para LIMIT/OFFSET', () => {
    const w = new Where().add('a = ?', 1);
    expect(w.next(50)).toBe('$2');
    expect(w.next(0)).toBe('$3');
    expect(w.params).toEqual([1, 50, 0]);
  });
});

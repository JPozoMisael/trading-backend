import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { Group, Mode, Where } from './filters';

/** Todas las consultas del dashboard. Solo SELECT. */
@Injectable()
export class TradingRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfig,
  ) {}

  private get side() {
    return this.config.get('SIDE_STRATEGIES');
  }

  openPositions() {
    return this.db.query(
      `SELECT p.*, (COALESCE(p.strategy_name, '') = ANY($1)) AS lateral
         FROM v_open_positions p
        ORDER BY p.opened_at DESC`,
      [this.side],
    );
  }

  async closedTrades(opts: {
    group: Group;
    mode: Mode;
    pair?: string;
    limit: number;
    offset: number;
  }) {
    const w = new Where()
      .add(`o.status = 'closed'`)
      .add(`o.execution_mode = ?`, opts.mode)
      .group(opts.group, this.side, 'o.strategy_name');
    if (opts.pair) w.add(`o.pair = ?`, opts.pair);
    const where = w.toString();
    const countParams = [...w.params];
    const lim = w.next(opts.limit);
    const off = w.next(opts.offset);

    const [rows, total] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.pair, o.direction, o.strategy_name, o.execution_mode,
                o.volume_lots, o.entry_price, o.stop_loss, o.take_profit,
                o.exit_price, o.exit_reason, o.pnl, o.r_multiple, o.risk_amount,
                o.opened_at, o.closed_at, s.confidence
           FROM orders o
           LEFT JOIN signals s ON s.id = o.signal_id
           ${where}
          ORDER BY o.closed_at DESC NULLS LAST, o.id DESC
          LIMIT ${lim} OFFSET ${off}`,
        w.params,
      ),
      this.db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM orders o ${where}`,
        countParams,
      ),
    ]);
    return { total: total[0]?.n ?? 0, rows };
  }

  /** Resumen del grupo: operaciones, acierto, PnL, R promedio, profit factor, peor racha. */
  async summary(group: Group, mode: Mode) {
    const w = new Where()
      .add(`status = 'closed'`)
      .add(`execution_mode = ?`, mode)
      .group(group, this.side);
    const [row] = await this.db.query(
      `SELECT COUNT(*)::int                                         AS trades,
              COUNT(*) FILTER (WHERE pnl > 0)::int                  AS ganadas,
              COUNT(*) FILTER (WHERE pnl < 0)::int                  AS perdidas,
              ROUND(AVG(CASE WHEN pnl > 0 THEN 100.0 ELSE 0 END), 1) AS acierto_pct,
              ROUND(SUM(COALESCE(pnl, 0))::numeric, 2)              AS pnl_total,
              ROUND(AVG(r_multiple)::numeric, 3)                    AS r_promedio,
              ROUND(SUM(COALESCE(r_multiple, 0))::numeric, 2)       AS r_total,
              ROUND((SUM(pnl) FILTER (WHERE pnl > 0)
                    / NULLIF(ABS(SUM(pnl) FILTER (WHERE pnl < 0)), 0))::numeric, 2) AS profit_factor
         FROM orders ${w.toString()}`,
      w.params,
    );
    return row;
  }

  /** Por par, para la tabla de rendimiento. */
  byPair(group: Group, mode: Mode) {
    const w = new Where()
      .add(`status = 'closed'`)
      .add(`execution_mode = ?`, mode)
      .group(group, this.side);
    return this.db.query(
      `SELECT pair,
              COUNT(*)::int                                         AS trades,
              ROUND(AVG(CASE WHEN pnl > 0 THEN 100.0 ELSE 0 END), 1) AS acierto_pct,
              ROUND(SUM(COALESCE(pnl, 0))::numeric, 2)              AS pnl_total,
              ROUND(AVG(r_multiple)::numeric, 3)                    AS r_promedio
         FROM orders ${w.toString()}
        GROUP BY pair
        ORDER BY pair`,
      w.params,
    );
  }

  /** Curva acumulada del grupo (la vista v_equity_curve mezcla modelo y práctica). */
  equityCurve(group: Group, mode: Mode) {
    const w = new Where()
      .add(`status = 'closed'`)
      .add(`closed_at IS NOT NULL`)
      .add(`execution_mode = ?`, mode)
      .group(group, this.side);
    return this.db.query(
      `SELECT id AS order_id, closed_at, pair, strategy_name, pnl, r_multiple,
              SUM(COALESCE(pnl, 0))        OVER w AS pnl_acumulado,
              SUM(COALESCE(r_multiple, 0)) OVER w AS r_acumulado
         FROM orders ${w.toString()}
       WINDOW w AS (ORDER BY closed_at, id)
        ORDER BY closed_at, id`,
      w.params,
    );
  }

  /** PnL por día en la zona horaria de los reportes (Ecuador por defecto). */
  dailyPnl(group: Group, mode: Mode, days: number) {
    const w = new Where()
      .add(`status = 'closed'`)
      .add(`closed_at IS NOT NULL`)
      .add(`execution_mode = ?`, mode)
      .group(group, this.side);
    const tz = w.next(this.config.get('DISPLAY_TZ'));
    w.add(`closed_at >= now() - make_interval(days => ?)`, days);
    return this.db.query(
      `SELECT (closed_at AT TIME ZONE ${tz})::date AS dia,
              COUNT(*)::int                          AS trades,
              ROUND(SUM(pnl)::numeric, 2)            AS pnl,
              ROUND(SUM(r_multiple)::numeric, 2)     AS r
         FROM orders ${w.toString()}
        GROUP BY 1
        ORDER BY 1`,
      w.params,
    );
  }

  /** Embudo: señales -> reservadas -> ejecutadas -> cerradas, últimos N días. */
  funnel(days: number) {
    return this.db.query(
      `SELECT day::date AS dia, strategy_name, signals, orders_reserved,
              orders_executed, orders_closed, orders_failed
         FROM v_signal_funnel
        WHERE day >= now() - make_interval(days => $1)
        ORDER BY day DESC, strategy_name`,
      [days],
    );
  }

  candles(pair: string, granularity: string, limit: number) {
    return this.db.query(
      `SELECT * FROM (
         SELECT timestamp AS time, open, high, low, close, volume
           FROM candles
          WHERE pair = $1 AND granularity = $2
          ORDER BY timestamp DESC
          LIMIT $3) t
        ORDER BY time`,
      [pair, granularity, limit],
    );
  }

  /** Operaciones (abiertas y cerradas) de un par desde una fecha: para dibujarlas en el gráfico. */
  tradesForChart(pair: string, since: Date) {
    return this.db.query(
      `SELECT id, direction, strategy_name, status, execution_mode,
              entry_price, stop_loss, take_profit, exit_price, exit_reason,
              pnl, r_multiple, opened_at, closed_at,
              (COALESCE(strategy_name, '') = ANY($3)) AS lateral
         FROM orders
        WHERE pair = $1 AND opened_at IS NOT NULL AND opened_at >= $2
          AND status IN ('filled', 'closed')
        ORDER BY opened_at`,
      [pair, since, this.side],
    );
  }

  /** La última evaluación del modelo por par: "lo que ve el modelo ahora". */
  latestEvaluations(pairs: string[]) {
    return this.db.query(
      `SELECT DISTINCT ON (pair, strategy_name) *
         FROM model_evaluations
        WHERE pair = ANY($1)
        ORDER BY pair, strategy_name, timestamp DESC`,
      [pairs],
    );
  }

  evaluations(pair: string, granularity: string, limit: number) {
    return this.db.query(
      `SELECT pair, granularity, timestamp, strategy_name, p_long, p_short, umbral,
              close, atr, sl_atr, tp_atr, horizonte_velas, senal, factores
         FROM model_evaluations
        WHERE pair = $1 AND granularity = $2
        ORDER BY timestamp DESC
        LIMIT $3`,
      [pair, granularity, limit],
    );
  }

  backtests(limit: number) {
    return this.db.query(
      `SELECT * FROM v_backtest_summary ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
  }

  schemaVersion() {
    return this.db.query<{ version: number }>(
      `SELECT MAX(version)::int AS version FROM schema_version`,
    );
  }
}

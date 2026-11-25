import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AppConfig } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';
import { GRANULARITIES, groupSchema, modeSchema, pairSchema } from './filters';
import { TradingRepository } from './trading.repository';

const groupModeQ = z.object({ group: groupSchema, mode: modeSchema });

const tradesQ = groupModeQ.extend({
  pair: pairSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const dailyQ = groupModeQ.extend({
  days: z.coerce.number().int().min(1).max(730).default(90),
});

const daysQ = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const candlesQ = z.object({
  pair: pairSchema,
  granularity: z.enum(GRANULARITIES).default('H1'),
  limit: z.coerce.number().int().min(10).max(5000).default(500),
});

const evalsQ = z.object({
  pair: pairSchema,
  granularity: z.enum(GRANULARITIES).default('H1'),
  limit: z.coerce.number().int().min(1).max(2000).default(48),
});

@Controller()
export class TradingController {
  constructor(
    private readonly repo: TradingRepository,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  /** Lo que el front necesita saber al cargar: instrumentos y temporalidad. */
  @Get('meta')
  meta() {
    return {
      pairs: this.config.get('PAIRS'),
      granularity: this.config.get('GRANULARITY'),
      timezone: this.config.get('DISPLAY_TZ'),
      sideStrategies: this.config.get('SIDE_STRATEGIES'),
    };
  }

  /** Snapshot de cuenta que publica el execution-engine cada 5 s (state:account). */
  @Get('account')
  account() {
    return this.redis.getJson('state:account');
  }

  @Get('positions')
  positions() {
    return this.repo.openPositions();
  }

  @Get('trades')
  trades(@Query(new ZodPipe(tradesQ)) q: z.infer<typeof tradesQ>) {
    return this.repo.closedTrades(q);
  }

  @Get('performance')
  async performance(
    @Query(new ZodPipe(groupModeQ)) q: z.infer<typeof groupModeQ>,
  ) {
    const [resumen, porPar] = await Promise.all([
      this.repo.summary(q.group, q.mode),
      this.repo.byPair(q.group, q.mode),
    ]);
    return { resumen, porPar };
  }

  @Get('equity')
  equity(@Query(new ZodPipe(groupModeQ)) q: z.infer<typeof groupModeQ>) {
    return this.repo.equityCurve(q.group, q.mode);
  }

  @Get('daily-pnl')
  dailyPnl(@Query(new ZodPipe(dailyQ)) q: z.infer<typeof dailyQ>) {
    return this.repo.dailyPnl(q.group, q.mode, q.days);
  }

  @Get('funnel')
  funnel(@Query(new ZodPipe(daysQ)) q: z.infer<typeof daysQ>) {
    return this.repo.funnel(q.days);
  }

  @Get('backtests')
  backtests() {
    return this.repo.backtests(50);
  }

  /** Velas + operaciones del mismo rango: todo lo que dibuja el gráfico. */
  @Get('chart')
  async chart(@Query(new ZodPipe(candlesQ)) q: z.infer<typeof candlesQ>) {
    const candles = await this.repo.candles(q.pair, q.granularity, q.limit);
    const desde = candles[0]?.time as Date | undefined;
    const trades = desde ? await this.repo.tradesForChart(q.pair, desde) : [];
    return { candles, trades };
  }

  /** "Lo que ve el modelo ahora": última evaluación por par + latido de Redis. */
  @Get('model/latest')
  async modelLatest() {
    const pairs = this.config.get('PAIRS');
    const [evals, estados] = await Promise.all([
      this.repo.latestEvaluations(pairs),
      Promise.all(pairs.map((p) => this.redis.getJson(`state:strategy:${p}`))),
    ]);
    return pairs.map((pair, i) => ({
      pair,
      estado: estados[i],
      evaluaciones: evals.filter((e) => e.pair === pair),
    }));
  }

  @Get('model/evaluations')
  modelEvaluations(@Query(new ZodPipe(evalsQ)) q: z.infer<typeof evalsQ>) {
    return this.repo.evaluations(q.pair, q.granularity, q.limit);
  }
}

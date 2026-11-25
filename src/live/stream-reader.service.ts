import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Subject } from 'rxjs';
import { AppConfig } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';

export interface LiveEvent {
  event: string;
  data: unknown;
}

/** Stream de Redis (lo publica Python) -> nombre del evento que recibe el navegador. */
const STREAMS: Record<string, string> = {
  'signals:new': 'signal',
  'orders:executed': 'order:executed',
  'orders:closed': 'order:closed',
  'risk:alerts': 'risk:alert',
};

const STATE_POLL_MS = 5_000;
const BLOCK_MS = 5_000;

/**
 * Lee los streams con XREAD (sin grupos: no consume ni confirma mensajes, los
 * servicios de Python siguen recibiendo todo) y publica cada mensaje en `events$`.
 * Además revisa cada 5 s las claves de estado (cuenta y latido del modelo) y
 * emite solo si cambiaron.
 */
@Injectable()
export class StreamReaderService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(StreamReaderService.name);
  readonly events$ = new Subject<LiveEvent>();
  private reader!: Redis;
  private running = false;
  private stateTimer?: NodeJS.Timeout;
  private readonly lastState = new Map<string, string>();
  private readonly streamToEvent: Record<string, string>;

  constructor(
    private readonly redis: RedisService,
    config: AppConfig,
  ) {
    this.streamToEvent = { ...STREAMS };
    for (const pair of config.get('PAIRS')) {
      this.streamToEvent[`market:candle:${pair}`] = 'candle';
    }
  }

  onApplicationBootstrap() {
    this.running = true;
    this.reader = this.redis.createClient('lector de streams');
    void this.loop();
    this.stateTimer = setInterval(() => void this.pollState(), STATE_POLL_MS);
  }

  onModuleDestroy() {
    this.running = false;
    if (this.stateTimer) clearInterval(this.stateTimer);
    this.reader?.disconnect();
    this.events$.complete();
  }

  /** Último id de cada stream (o 0-0 si está vacío): así no se pierde nada entre lecturas. */
  private async initialIds(keys: string[]): Promise<string[]> {
    return Promise.all(
      keys.map(async (k) => {
        const last = await this.redis.client.xrevrange(k, '+', '-', 'COUNT', 1);
        return last[0]?.[0] ?? '0-0';
      }),
    );
  }

  private async loop() {
    const keys = Object.keys(this.streamToEvent);
    let ids: string[] | null = null;
    let espera = 1_000;

    while (this.running) {
      try {
        ids ??= await this.initialIds(keys);
        const res = await this.reader.xread(
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          ...keys,
          ...ids,
        );
        espera = 1_000;
        if (!res) continue;

        for (const [stream, mensajes] of res) {
          const idx = keys.indexOf(stream);
          for (const [id, campos] of mensajes) {
            ids[idx] = id;
            this.emitMessage(stream, campos);
          }
        }
      } catch (e) {
        if (!this.running) break;
        this.log.warn(
          `Lectura de streams falló, reintento en ${espera / 1000}s: ${(e as Error).message}`,
        );
        ids = null; // al reconectar se vuelve a tomar el último id
        await new Promise((r) => setTimeout(r, espera));
        espera = Math.min(espera * 2, 30_000);
      }
    }
  }

  private emitMessage(stream: string, campos: string[]) {
    // Python publica {"data": "<json>"}: campos = ['data', '<json>']
    const i = campos.indexOf('data');
    if (i < 0) return;
    let data: unknown;
    try {
      data = JSON.parse(campos[i + 1]);
    } catch {
      return;
    }
    this.events$.next({ event: this.streamToEvent[stream], data });
  }

  private async pollState() {
    try {
      const keys = [
        'state:account',
        ...Object.keys(this.streamToEvent)
          .filter((k) => k.startsWith('market:candle:'))
          .map((k) => `state:strategy:${k.slice('market:candle:'.length)}`),
      ];
      const values = await this.redis.client.mget(...keys);
      keys.forEach((key, i) => {
        const raw = values[i];
        if (raw == null || this.lastState.get(key) === raw) return;
        this.lastState.set(key, raw);
        try {
          const data: unknown = JSON.parse(raw);
          if (key === 'state:account') {
            this.events$.next({ event: 'account', data });
          } else {
            const pair = key.slice('state:strategy:'.length);
            this.events$.next({
              event: 'strategy',
              data: { pair, ...(data as object) },
            });
          }
        } catch {
          /* JSON inválido: se ignora */
        }
      });
    } catch (e) {
      this.log.debug(`No se pudo leer el estado: ${(e as Error).message}`);
    }
  }
}

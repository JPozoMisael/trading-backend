import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.constants';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

/** true si responde a tiempo; false si falla o tarda más de `ms`. */
function withTimeout(p: Promise<boolean>, ms = 3_000): Promise<boolean> {
  return Promise.race([
    p.catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms).unref()),
  ]);
}

/** Para el health check de Dokploy. Público: no devuelve datos, solo ok / caído. */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      withTimeout(this.db.ping()),
      withTimeout(this.redis.ping()),
    ]);
    const body = { status: db && redis ? 'ok' : 'degradado', db, redis };
    if (!db || !redis) throw new ServiceUnavailableException(body);
    return body;
  }
}

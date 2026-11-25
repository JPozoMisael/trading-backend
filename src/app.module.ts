import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { InfraModule } from './common/infra.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { LiveGateway } from './live/live.gateway';
import { StreamReaderService } from './live/stream-reader.service';
import { TradingController } from './trading/trading.controller';
import { TradingRepository } from './trading/trading.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    InfraModule,
    AuthModule,
  ],
  controllers: [HealthController, TradingController],
  providers: [
    // El de límite de peticiones va antes que el de sesión: frena fuerza bruta al login
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    TradingRepository,
    StreamReaderService,
    LiveGateway,
  ],
})
export class AppModule {}

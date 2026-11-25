import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Global()
@Module({
  providers: [AppConfig, DatabaseService, RedisService],
  exports: [AppConfig, DatabaseService, RedisService],
})
export class InfraModule {}

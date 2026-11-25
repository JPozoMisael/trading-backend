import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  // Detrás del proxy de Dokploy (Traefik) + nginx: la IP real viene en X-Forwarded-For
  app.set('trust proxy', 2);
  app.enableShutdownHooks();

  const origin = config.get('CORS_ORIGIN');
  if (origin) {
    app.enableCors({ origin: origin.split(','), credentials: true });
  }

  const port = config.get('PORT');
  await app.listen(port, '0.0.0.0');
  new Logger('Arranque').log(
    `API del dashboard en http://localhost:${port}/api (solo lectura)`,
  );
}

void bootstrap();

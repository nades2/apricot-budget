import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // Global URL prefix — everything is served under /api.
  app.setGlobalPrefix('api');

  // DTO validation + auto-transform from plain JSON to class instances.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Map Prisma errors → clean HTTP responses.
  app.useGlobalFilters(new PrismaExceptionFilter());

  // CORS for the Vite dev server (and future prod domain).
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:5173').split(','),
    credentials: true,
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`🚀 apricot-budget API ready on http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();

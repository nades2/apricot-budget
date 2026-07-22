import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { PrismaService } from './prisma/prisma.service';

/**
 * Refuse de démarrer en production si le user seed de démo
 * (`demo@apricot.local`) est présent en DB. Ce compte a un password
 * hard-codé (`demo1234`) — s'il traîne en prod, prise de compte triviale.
 *
 * Le seed ne le crée que quand `NODE_ENV !== 'production'`, mais un
 * `npm run seed` roulé par erreur en prod (ou une DB migrée depuis dev)
 * peut l'introduire. Fail-fast est la seule bonne réponse.
 */
async function assertNoDemoUserInProd(prisma: PrismaService, isProd: boolean) {
  if (!isProd) return;
  const demo = await prisma.user.findFirst({
    where: { email: 'demo@apricot.local' },
    select: { id: true, email: true },
  });
  if (demo) {
    throw new Error(
      `Refusing to start: demo user "${demo.email}" (id=${demo.id}) exists in production database. ` +
      `Delete it with:  DELETE FROM users WHERE email = 'demo@apricot.local';`,
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // Trust `X-Forwarded-For` / `X-Real-IP` set by nginx (docker/nginx.conf) et
  // Cloudflare Tunnel. Sans ça, `req.ip` renvoie l'IP du container nginx
  // interne — le rate limiter appliquerait sa limite globalement au lieu de
  // par IP client. Trust 1 hop = nginx uniquement (Cloudflare rewrite les
  // headers avant nginx).
  app.set('trust proxy', 1);

  // Cache le header `X-Powered-By: Express` — évite le fingerprinting bête.
  app.disable('x-powered-by');

  // Fail-fast : refuse d'exposer un compte demo hard-codé en production.
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const prisma = app.get(PrismaService);
  await assertNoDemoUserInProd(prisma, isProd);

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

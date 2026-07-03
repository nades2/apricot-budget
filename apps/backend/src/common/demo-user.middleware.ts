import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Temporary auth stand-in.
 *
 * We do not have JWT yet, but every controller needs a `userId` to scope its
 * queries. This middleware resolves the demo user seeded by `prisma db seed`
 * and attaches it to `req.user` so the `@CurrentUser()` decorator works
 * uniformly. When real auth lands, swap this out for a JwtStrategy — the
 * controllers stay untouched.
 */
@Injectable()
export class DemoUserMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DemoUserMiddleware.name);
  private cachedUserId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    if (!this.cachedUserId) {
      const demo = await this.prisma.user.findUnique({
        where: { email: 'demo@apricot.local' },
        select: { id: true },
      });
      if (!demo) {
        this.logger.warn('Demo user not found — run `npx prisma db seed`.');
      }
      this.cachedUserId = demo?.id ?? null;
    }
    (req as Request & { user?: { id: string } }).user = this.cachedUserId
      ? { id: this.cachedUserId }
      : undefined;
    next();
  }
}

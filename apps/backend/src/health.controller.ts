import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    // 1 = 1 round trip through Prisma, proving the DB is reachable.
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      db: 'up',
      time: new Date().toISOString(),
    };
  }
}

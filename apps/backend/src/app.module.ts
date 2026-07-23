import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CsvImportModule } from './csv-import/csv-import.module';
import { CalendarModule } from './calendar/calendar.module';
import { BudgetModule } from './budget/budget.module';
import { ForecastModule } from './forecast/forecast.module';
import { RecurrenceDetectorModule } from './recurrence-detector/recurrence-detector.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '../.env', '.env'],
    }),
    // Rate limiting — 2 tiers pour cibler différents scénarios.
    // `default` : anti-burst (60 req / 10s / IP) sur toutes les routes.
    // `medium`  : anti-scraping (300 req / min / IP).
    //
    // IMPORTANT : le nom `default` doit correspondre exactement à celui
    // ciblé par @Throttle({ default: {...} }) dans AuthController — sinon
    // l'override est silencieusement ignoré et seuls les limits globaux
    // s'appliquent (bug caché : les tests semblent passer mais les
    // endpoints auth ne sont pas plus stricts que le reste).
    //
    // Les endpoints auth (login, register, password) overrident ces
    // limites via @Throttle() dans AuthController.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 10_000, limit: 60 },
      { name: 'medium', ttl: 60_000, limit: 300 },
    ]),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    AccountsModule,
    TransactionsModule,
    CsvImportModule,
    CalendarModule,
    BudgetModule,
    ForecastModule,
    RecurrenceDetectorModule,
    ReconciliationModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard global — chaque route est limitée par les policies ThrottlerModule
    // ci-dessus. Le guard s'exécute AVANT le JwtAuthGuard (ordre APP_GUARD),
    // donc les non-authentifiés (login/register) sont limités par IP.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

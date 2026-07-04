import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
})
export class AppModule {}

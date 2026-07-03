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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '../.env', '.env'],
    }),
    PrismaModule,
    AuthModule,             // must load before feature modules — installs global JwtAuthGuard
    CategoriesModule,
    AccountsModule,
    TransactionsModule,
    CsvImportModule,
    CalendarModule,
    BudgetModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

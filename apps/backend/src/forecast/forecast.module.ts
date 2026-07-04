import { Module } from '@nestjs/common';
import { ForecastController } from './forecast.controller';
import { ForecastService } from './forecast.service';
import { ForecastAlertsService } from './forecast-alerts.service';

@Module({
  controllers: [ForecastController],
  providers: [ForecastService, ForecastAlertsService],
  exports: [ForecastService, ForecastAlertsService],
})
export class ForecastModule {}

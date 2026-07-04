import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { ForecastService } from './forecast.service';
import { ForecastAlertsService } from './forecast-alerts.service';
import { QueryForecastDto } from './dto/query-forecast.dto';

@Controller('forecast')
export class ForecastController {
  constructor(
    private readonly forecast: ForecastService,
    private readonly alerts: ForecastAlertsService,
  ) {}

  /**
   * GET /api/forecast/alerts?horizonDays=30&defaultThreshold=0
   *
   * Retourne les alertes J-7 (et jusqu a J-30) sur les comptes actifs.
   * IMPORTANT : cette route doit etre declaree AVANT `:accountId` pour ne
   * pas etre capturee comme un UUID par le pipe.
   */
  @Get('alerts')
  alertsScan(
    @CurrentUser() user: AuthenticatedUser,
    @Query('horizonDays') horizonDays?: string,
    @Query('defaultThreshold') defaultThreshold?: string,
  ) {
    return this.alerts.scan(user.id, {
      horizonDays: horizonDays ? Math.min(365, Math.max(1, Number(horizonDays))) : undefined,
      defaultThreshold,
    });
  }

  /**
   * GET /api/forecast/:accountId?from=YYYY-MM-DD&to=YYYY-MM-DD[&lowBalanceThreshold=200]
   *
   * Retourne la timeline de solde projete pour un compte sur la fenetre
   * donnee. Consomme par la vue calendrier PocketSmith-style et le graphique
   * cashflow (Recharts). Horizon max = 400 jours.
   */
  @Get(':accountId')
  build(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query() q: QueryForecastDto,
  ) {
    return this.forecast.build(user.id, accountId, q.from, q.to, q.lowBalanceThreshold);
  }
}

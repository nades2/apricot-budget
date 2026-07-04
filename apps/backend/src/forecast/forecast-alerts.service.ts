import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForecastService } from './forecast.service';

export type ForecastAlert = {
  accountId: string;
  accountName: string;
  currency: string;
  firstBelowDate: string;
  daysUntil: number;                 // >= 0. J-7 = 7, aujourd hui = 0.
  projectedBalance: string;
  lowBalanceThreshold: string;
  severity: 'imminent' | 'soon' | 'watch'; // 0-3j / 4-7j / 8-30j
};

const DEFAULT_HORIZON_DAYS = 30;
const IMMINENT_THRESHOLD_DAYS = 3;
const SOON_THRESHOLD_DAYS = 7;

/**
 * ForecastAlertsService — calcule a la demande les alertes de solde bas
 * pour tous les comptes actifs de l utilisateur, sur les 30 prochains jours.
 *
 * Pas de persistance : ce service tourne quand le frontend en a besoin, ce
 * qui evite un cron/worker. La reponse est petite et le calcul est deja
 * rapide (< 100 ms pour un menage typique).
 */
@Injectable()
export class ForecastAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly forecast: ForecastService,
  ) {}

  async scan(userId: string, opts: { horizonDays?: number; defaultThreshold?: string } = {}): Promise<ForecastAlert[]> {
    const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
    const defaultThreshold = opts.defaultThreshold ?? '0';

    const accounts = await this.prisma.account.findMany({
      where: { userId, isArchived: false, type: 'ASSET' },
      select: { id: true, name: true, currency: true },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const from = toISODate(today);
    const to = toISODate(addDays(today, horizonDays));

    const alerts: ForecastAlert[] = [];

    for (const acc of accounts) {
      const forecast = await this.forecast.build(userId, acc.id, from, to, defaultThreshold);
      const firstBelow = forecast.days.find((d) => d.belowThreshold);
      if (!firstBelow) continue;

      const daysUntil = Math.round(
        (parseIsoDate(firstBelow.date).getTime() - today.getTime()) / 86_400_000,
      );

      alerts.push({
        accountId: acc.id,
        accountName: acc.name,
        currency: acc.currency,
        firstBelowDate: firstBelow.date,
        daysUntil,
        projectedBalance: firstBelow.balance,
        lowBalanceThreshold: forecast.lowBalanceThreshold ?? defaultThreshold,
        severity: daysUntil <= IMMINENT_THRESHOLD_DAYS ? 'imminent'
          : daysUntil <= SOON_THRESHOLD_DAYS ? 'soon' : 'watch',
      });
    }

    // Trier : plus urgent en premier.
    alerts.sort((a, b) => a.daysUntil - b.daysUntil);
    return alerts;
  }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

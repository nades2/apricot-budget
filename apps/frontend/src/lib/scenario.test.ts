import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeTimeline, scenarioDelta, Hypothesis } from './scenario';
import { ForecastResponse, ForecastDay } from './api';

const mkDay = (date: string, netDelta: number, balance: number): ForecastDay => ({
  date,
  realizedDelta: '0',
  projectedDelta: netDelta.toFixed(2),
  netDelta: netDelta.toFixed(2),
  balance: balance.toFixed(2),
  entries: [],
  belowThreshold: false,
});

const mkForecast = (opening: number, days: ForecastDay[], threshold: string | null = null): ForecastResponse => ({
  accountId: 'acc-1',
  currency: 'CAD',
  from: days[0].date,
  to: days[days.length - 1].date,
  openingBalance: opening.toFixed(2),
  closingBalance: days[days.length - 1].balance,
  lowBalanceThreshold: threshold,
  days,
});

describe('recomputeTimeline', () => {
  it('sans hypothese, renvoie la baseline telle quelle', () => {
    const baseline = mkForecast(1000, [
      mkDay('2026-07-01', 0, 1000),
      mkDay('2026-07-02', -50, 950),
    ]);
    const result = recomputeTimeline(baseline, []);
    assert.equal(result, baseline.days);  // meme reference — pas de recalcul
  });

  it('ajoute une depense hypothetique le bon jour', () => {
    const baseline = mkForecast(1000, [
      mkDay('2026-07-01', 0, 1000),
      mkDay('2026-07-02', 0, 1000),
      mkDay('2026-07-03', 0, 1000),
    ]);
    const hyps: Hypothesis[] = [
      { id: 'h1', date: '2026-07-02', amount: '200', direction: 'EXPENSE', label: 'test' },
    ];
    const result = recomputeTimeline(baseline, hyps);
    assert.equal(result[0].balance, '1000.00');
    assert.equal(result[1].balance, '800.00');
    assert.equal(result[2].balance, '800.00');   // propage sur les jours suivants
  });

  it('additionne plusieurs hypotheses le meme jour', () => {
    const baseline = mkForecast(1000, [
      mkDay('2026-07-01', 0, 1000),
      mkDay('2026-07-02', 0, 1000),
    ]);
    const hyps: Hypothesis[] = [
      { id: 'h1', date: '2026-07-02', amount: '100', direction: 'EXPENSE', label: 'a' },
      { id: 'h2', date: '2026-07-02', amount: '50', direction: 'EXPENSE', label: 'b' },
      { id: 'h3', date: '2026-07-02', amount: '30', direction: 'INCOME', label: 'c' },
    ];
    const result = recomputeTimeline(baseline, hyps);
    // -100 - 50 + 30 = -120
    assert.equal(result[1].balance, '880.00');
  });

  it('marque belowThreshold quand la balance passe sous le seuil', () => {
    const baseline = mkForecast(1000, [
      mkDay('2026-07-01', 0, 1000),
      mkDay('2026-07-02', 0, 1000),
    ], '500');
    const hyps: Hypothesis[] = [
      { id: 'h1', date: '2026-07-02', amount: '600', direction: 'EXPENSE', label: 'gros' },
    ];
    const result = recomputeTimeline(baseline, hyps);
    assert.equal(result[0].belowThreshold, false);
    assert.equal(result[1].belowThreshold, true);
  });
});

describe('scenarioDelta', () => {
  it('retourne 0 quand baseline == scenario', () => {
    const baseline = mkForecast(1000, [mkDay('2026-07-01', 0, 1000)]);
    const d = scenarioDelta(baseline, baseline.days);
    assert.equal(d, 0);
  });

  it('retourne l ecart signe au dernier jour', () => {
    const baseline = mkForecast(1000, [
      mkDay('2026-07-01', 0, 1000),
      mkDay('2026-07-02', 0, 1000),
    ]);
    const scenario = [
      { ...baseline.days[0] },
      { ...baseline.days[1], balance: '750.00' },
    ];
    assert.equal(scenarioDelta(baseline, scenario), -250);
  });
});

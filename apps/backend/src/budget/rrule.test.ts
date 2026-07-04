import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { budgetItemOccurrences } from './rrule';

describe('budgetItemOccurrences (mode enum)', () => {
  it('MONTHLY depuis anchorDate, 3 mois', () => {
    const item = {
      recurrence: 'MONTHLY' as const,
      anchorDate: new Date('2026-01-15T00:00:00Z'),
      endDate: null,
      rrule: null,
      dtstart: null,
    };
    const dates = budgetItemOccurrences(item, new Date('2026-01-01'), new Date('2026-04-30'));
    assert.equal(dates.length, 4);
    assert.equal(dates[0].toISOString().slice(0, 10), '2026-01-15');
    assert.equal(dates[3].toISOString().slice(0, 10), '2026-04-15');
  });

  it('respecte endDate', () => {
    const item = {
      recurrence: 'WEEKLY' as const,
      anchorDate: new Date('2026-01-05T00:00:00Z'),
      endDate: new Date('2026-01-20T00:00:00Z'),
      rrule: null,
      dtstart: null,
    };
    const dates = budgetItemOccurrences(item, new Date('2026-01-01'), new Date('2026-02-28'));
    assert.equal(dates.length, 3);  // 05, 12, 19
  });
});

describe('budgetItemOccurrences (mode RRULE)', () => {
  it('supporte FREQ=MONTHLY;BYMONTHDAY=1,15', () => {
    const item = {
      recurrence: 'MONTHLY' as const,
      anchorDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15',
      dtstart: new Date('2026-01-01T00:00:00Z'),
    };
    const dates = budgetItemOccurrences(item, new Date('2026-01-01'), new Date('2026-02-28'));
    const isos = dates.map((d) => d.toISOString().slice(0, 10));
    assert.deepEqual(isos, ['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15']);
  });

  it('supporte FREQ=WEEKLY;INTERVAL=2 (aux 2 semaines)', () => {
    const item = {
      recurrence: 'BIWEEKLY' as const,
      anchorDate: new Date('2026-01-02T00:00:00Z'),
      endDate: null,
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
      dtstart: new Date('2026-01-02T00:00:00Z'),
    };
    const dates = budgetItemOccurrences(item, new Date('2026-01-01'), new Date('2026-02-28'));
    assert.equal(dates.length, 5);  // 5 vendredis alternes sur ~2 mois
  });
});

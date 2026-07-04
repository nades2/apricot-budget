import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { normalize, detectCadence, scoreConfidence, buildCandidates, TxInput } from './detection';

describe('normalize', () => {
  it('strip dates suffixes typiques BNC', () => {
    const a = normalize('PAIEMENT PREAUTORISE HYDRO-QUEBEC MTL 09NOV');
    const b = normalize('PAIEMENT PREAUTORISE HYDRO-QUEBEC MTL 08DEC');
    assert.equal(a, b);
    assert.match(a, /HYDRO/);
  });

  it('normalise en majuscules et retire la ponctuation', () => {
    const n = normalize('Netflix.com  # 12345');
    assert.equal(n, 'NETFLIX COM');
  });

  it('coupe a 40 caracteres', () => {
    const long = 'ABCDEFGHIJ'.repeat(10);
    assert.equal(normalize(long).length, 40);
  });
});

describe('detectCadence', () => {
  it('mappe les intervalles medians aux enums attendus', () => {
    assert.equal(detectCadence(7), 'WEEKLY');
    assert.equal(detectCadence(14), 'BIWEEKLY');
    assert.equal(detectCadence(30), 'MONTHLY');
    assert.equal(detectCadence(365), 'YEARLY');
    assert.equal(detectCadence(20), null);          // hors bande
    assert.equal(detectCadence(100), null);
  });
});

describe('scoreConfidence', () => {
  it('note haute : 5 occurrences, stdev 0, montant stable', () => {
    const s = scoreConfidence(5, 0, 0.01);
    assert.ok(s >= 90, `expected >= 90, got ${s}`);
  });

  it('note basse : minimum 3 occurrences, stdev fort, montant instable', () => {
    const s = scoreConfidence(3, 5, 0.5);
    assert.ok(s < 60, `expected < 60, got ${s}`);
  });

  it('borne entre 0 et 100', () => {
    assert.ok(scoreConfidence(100, 0, 0) <= 100);
    assert.ok(scoreConfidence(1, 100, 100) >= 0);
  });
});

describe('buildCandidates', () => {
  const mkTx = (id: string, date: string, amount: number, desc: string): TxInput => ({
    id,
    postedAt: new Date(date + 'T00:00:00Z'),
    description: desc,
    amount: new Prisma.Decimal(amount),
    categoryId: null,
  });

  it('detecte une charge mensuelle stable (Netflix)', () => {
    const txs: TxInput[] = [
      mkTx('t1', '2026-01-15', -16.99, 'NETFLIX COM 15JAN'),
      mkTx('t2', '2026-02-15', -16.99, 'NETFLIX COM 15FEB'),
      mkTx('t3', '2026-03-15', -16.99, 'NETFLIX COM 15MAR'),
      mkTx('t4', '2026-04-15', -16.99, 'NETFLIX COM 15APR'),
    ];
    const result = buildCandidates(txs, { minConfidence: 50 });
    assert.equal(result.length, 1);
    assert.equal(result[0].recurrence, 'MONTHLY');
    assert.equal(result[0].direction, 'EXPENSE');
    assert.equal(result[0].occurrences, 4);
    assert.ok(result[0].confidence >= 70, `confidence should reflect real month-length variance, got ${result[0].confidence}`);
  });

  it('detecte une paie aux 2 semaines (INCOME)', () => {
    const txs: TxInput[] = [
      mkTx('t1', '2026-01-02', 1500, 'DEPOT PAIE ACME INC'),
      mkTx('t2', '2026-01-16', 1500, 'DEPOT PAIE ACME INC'),
      mkTx('t3', '2026-01-30', 1500, 'DEPOT PAIE ACME INC'),
      mkTx('t4', '2026-02-13', 1500, 'DEPOT PAIE ACME INC'),
    ];
    const result = buildCandidates(txs, { minConfidence: 50 });
    assert.equal(result.length, 1);
    assert.equal(result[0].recurrence, 'BIWEEKLY');
    assert.equal(result[0].direction, 'INCOME');
  });

  it('ignore les groupes sous le seuil de confiance', () => {
    // Seulement 3 occurrences, intervalle instable
    const txs: TxInput[] = [
      mkTx('t1', '2026-01-15', -50, 'RESTAURANT ALEA'),
      mkTx('t2', '2026-02-10', -75, 'RESTAURANT ALEA'),
      mkTx('t3', '2026-03-28', -30, 'RESTAURANT ALEA'),
    ];
    const result = buildCandidates(txs, { minConfidence: 80 });
    assert.equal(result.length, 0);
  });

  it('separe EXPENSE et INCOME meme si le libelle est identique', () => {
    const txs: TxInput[] = [
      mkTx('t1', '2026-01-15', -100, 'TRANSFERT'),
      mkTx('t2', '2026-02-15', -100, 'TRANSFERT'),
      mkTx('t3', '2026-03-15', -100, 'TRANSFERT'),
      mkTx('t4', '2026-01-15', 100, 'TRANSFERT'),
      mkTx('t5', '2026-02-15', 100, 'TRANSFERT'),
      mkTx('t6', '2026-03-15', 100, 'TRANSFERT'),
    ];
    const result = buildCandidates(txs, { minConfidence: 50 });
    assert.equal(result.length, 2);
    const dirs = new Set(result.map((r) => r.direction));
    assert.ok(dirs.has('EXPENSE') && dirs.has('INCOME'));
  });
});

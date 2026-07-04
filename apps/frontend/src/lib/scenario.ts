import { ForecastDay, ForecastResponse } from '../lib/api';

/**
 * Une hypothese what-if — transaction fictive ajoutee par l utilisateur pour
 * simuler l impact sur sa tresorerie. Reste en local state React ; jamais
 * persistee cote backend.
 */
export type Hypothesis = {
  id: string;                     // uuid genere cote client, cle React
  date: string;                   // YYYY-MM-DD dans la fenetre du forecast
  amount: string;                 // positif ; direction donne le signe
  direction: 'INCOME' | 'EXPENSE';
  label: string;
};

/**
 * Recalcule un timeline ForecastDay[] a partir d une baseline + hypotheses.
 * Fonction pure — meme entree = meme sortie, aucune dependance IO.
 *
 * Algorithme :
 *   1) Regrouper les hypotheses par jour, sommer leur delta signe.
 *   2) Repartir du openingBalance de la baseline.
 *   3) Pour chaque jour : newBalance = prevBalance + baseline.netDelta + hypDelta.
 *   4) Marquer belowThreshold selon le seuil de la baseline.
 *
 * Les hypotheses hors fenetre [from, to] sont ignorees silencieusement — c est
 * la responsabilite du ScenarioPanel de valider la date a la saisie.
 */
export function recomputeTimeline(
  baseline: ForecastResponse,
  hypotheses: Hypothesis[],
): ForecastDay[] {
  if (hypotheses.length === 0) return baseline.days;

  // 1) Regrouper par jour, signe applique.
  const extraByDay = new Map<string, number>();
  for (const h of hypotheses) {
    const signed = h.direction === 'EXPENSE' ? -Math.abs(Number(h.amount)) : Math.abs(Number(h.amount));
    extraByDay.set(h.date, (extraByDay.get(h.date) ?? 0) + signed);
  }

  const threshold = baseline.lowBalanceThreshold != null ? Number(baseline.lowBalanceThreshold) : null;
  let running = Number(baseline.openingBalance);

  return baseline.days.map((d) => {
    const extra = extraByDay.get(d.date) ?? 0;
    const netDelta = Number(d.netDelta) + extra;
    running += netDelta;
    return {
      ...d,
      netDelta: netDelta.toFixed(2),
      balance: running.toFixed(2),
      belowThreshold: threshold != null ? running < threshold : false,
    };
  });
}

/**
 * Delta scenario vs baseline pour affichage dans les KPIs :
 * "+250 CAD" ou "-1200 CAD" au dernier jour.
 */
export function scenarioDelta(baseline: ForecastResponse, scenario: ForecastDay[]): number {
  const b = Number(baseline.closingBalance);
  const s = scenario.length > 0 ? Number(scenario[scenario.length - 1].balance) : b;
  return s - b;
}

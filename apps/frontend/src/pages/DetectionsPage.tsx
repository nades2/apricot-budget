import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AcceptCandidatePayload,
  Category,
  DetectedRecurrence,
  api,
} from '../lib/api';
import { formatCurrency } from '../lib/format';

const CADENCE_LABELS: Record<string, string> = {
  DAILY: 'Chaque jour',
  WEEKLY: 'Chaque semaine',
  BIWEEKLY: 'Aux 2 semaines',
  MONTHLY: 'Chaque mois',
  YEARLY: 'Chaque année',
  ONCE: 'Une fois',
};

/**
 * Détecte les récurrences dans l'historique importé et propose à l'utilisateur
 * de les convertir en `BudgetItem` d'un clic. C'est le "wow effect" après un
 * import CSV — l'app dit "voici tes 12 dépenses/revenus récurrents" au lieu
 * de demander à l'utilisateur de les saisir à la main.
 */
export function DetectionsPage() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: candidates, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['recurrence-detector'],
    queryFn: () => api.get<DetectedRecurrence[]>('/recurrence-detector'),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const accept = useMutation({
    mutationFn: (payload: AcceptCandidatePayload) =>
      api.post('/recurrence-detector/accept', payload),
    onSuccess: (_res, variables) => {
      // Une fois créé côté serveur, on retire le candidat de la liste locale.
      setDismissed((prev) => new Set(prev).add(variables.candidate.key));
      qc.invalidateQueries({ queryKey: ['budget-items'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
    },
  });

  const visible = (candidates ?? []).filter((c) => !dismissed.has(c.key));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Récurrences détectées</h1>
          <p className="text-sm text-gray-500 mt-1">
            L'app a analysé ton historique bancaire des 12 derniers mois pour
            trouver ce qui revient régulièrement.
          </p>
        </div>

        <button
          onClick={() => {
            // Reset des ignores locaux — sinon un candidat "Ignore" precedent
            // resterait cache et l utilisateur croirait que le rescan ne fait rien.
            setDismissed(new Set());
            refetch();
          }}
          disabled={isFetching}
          className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded
                     hover:bg-gray-50 dark:hover:bg-gray-800
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-gray-700 dark:text-gray-200
                     inline-flex items-center gap-1.5 transition"
          title="Relancer l analyse sur les 12 derniers mois"
        >
          <i
            className={`ti ${isFetching ? 'ti-loader-2 animate-spin' : 'ti-refresh'}`}
            aria-hidden="true"
          />
          {isFetching ? 'Analyse...' : 'Rescanner'}
        </button>
      </header>

      {isLoading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Analyse en cours...</p>
      )}
      {!isLoading && candidates && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 tabular-nums">
          {candidates.length} recurrence{candidates.length > 1 ? 's' : ''} detectee{candidates.length > 1 ? 's' : ''}
          {isFetching && ' · mise a jour...'}
          {!isFetching && dataUpdatedAt > 0 && ` · dernier scan a ${new Date(dataUpdatedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        </p>
      )}
      {error && <p className="text-sm text-red-600">Erreur : {(error as Error).message}</p>}

      {candidates && visible.length === 0 && (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-10 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Rien de nouveau à proposer. Toutes les récurrences détectables sont
            déjà couvertes par des règles de budget.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visible.map((c) => (
          <CandidateCard
            key={c.key}
            candidate={c}
            categories={categories ?? []}
            onAccept={(overrides) => accept.mutate({ candidate: c, overrides })}
            onDismiss={() => setDismissed((prev) => new Set(prev).add(c.key))}
            busy={accept.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  categories,
  onAccept,
  onDismiss,
  busy,
}: {
  candidate: DetectedRecurrence;
  categories: Category[];
  onAccept: (overrides: AcceptCandidatePayload['overrides']) => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(candidate.suggestedName);
  const [amount, setAmount] = useState(candidate.avgAmount);
  const [categoryId, setCategoryId] = useState(candidate.categoryId ?? '');

  const canAccept = !!categoryId && Number(amount) > 0 && name.trim().length > 0;

  const confidenceClass =
    candidate.confidence >= 85 ? 'bg-cat-green-bg text-cat-green-fg' :
    candidate.confidence >= 70 ? 'bg-cat-teal-bg text-cat-teal-fg' :
    'bg-cat-yellow-bg text-cat-yellow-fg';

  return (
    <article className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white/60 dark:bg-black/20">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                candidate.direction === 'INCOME'
                  ? 'bg-cat-green-bg text-cat-green-fg'
                  : 'bg-cat-red-bg text-cat-red-fg'
              }`}
            >
              {candidate.direction === 'INCOME' ? '↓ Revenu' : '↑ Dépense'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {CADENCE_LABELS[candidate.recurrence] ?? candidate.recurrence}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceClass}`}>
              {candidate.confidence}% de fiabilité
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate" title={candidate.matchingDescriptions.join(' · ')}>
            {candidate.occurrences} occurrences ·
            de {candidate.firstSeen} à {candidate.lastSeen} ·
            prochain ≈ {candidate.nextExpected}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="text-xs">
          <span className="block text-gray-500 dark:text-gray-400 mb-1">Nom</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1"
          />
        </label>

        <label className="text-xs">
          <span className="block text-gray-500 dark:text-gray-400 mb-1">
            Montant (~{formatCurrency(candidate.avgAmount, true)})
          </span>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1 tabular-nums"
          />
        </label>

        <label className="text-xs col-span-2">
          <span className="block text-gray-500 dark:text-gray-400 mb-1">Catégorie</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1"
          >
            <option value="">— Choisir —</option>
            {categories
              .filter((cat) => (
                candidate.direction === 'INCOME'
                  ? cat.direction === 'INCOME' || cat.direction === 'NEUTRAL'
                  : cat.direction === 'EXPENSE' || cat.direction === 'NEUTRAL'
              ))
              .map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
          </select>
        </label>
      </div>

      <details className="mb-3">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
          Voir les libellés bancaires ({candidate.matchingDescriptions.length})
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400 pl-4">
          {candidate.matchingDescriptions.map((d, i) => (
            <li key={i} className="truncate" title={d}>· {d}</li>
          ))}
        </ul>
      </details>

      <footer className="flex justify-end gap-2">
        <button
          onClick={onDismiss}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Ignorer
        </button>
        <button
          onClick={() => onAccept({
            name: name.trim() !== candidate.suggestedName ? name.trim() : undefined,
            amount: amount !== candidate.avgAmount ? amount : undefined,
            categoryId: categoryId !== candidate.categoryId ? categoryId : undefined,
          })}
          disabled={!canAccept || busy}
          className="text-xs px-3 py-1.5 rounded bg-cat-teal-fg text-white font-medium hover:bg-cat-teal-fg/90 disabled:opacity-50"
        >
          {busy ? '…' : 'Accepter'}
        </button>
      </footer>
    </article>
  );
}

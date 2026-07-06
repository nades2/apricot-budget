import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CsvImport } from '../../lib/api';

/**
 * Historique des imports CSV.
 *
 * Affiche pour chaque import :
 *   - date d'importation (uploadedAt / confirmedAt selon statut)
 *   - fichier + compte cible
 *   - période couverte par les transactions (min / max postedAt)
 *   - nombre de transactions rattachées
 *   - bouton Supprimer (hard delete des transactions + de l'import)
 *
 * Suppression : irréversible, confirmée via window.confirm. Après succès on
 * invalide TOUTES les vues qui montrent des transactions (calendar, budget,
 * forecast, transactions) pour ne laisser trainer aucun cache périmé.
 */
export function ImportHistory() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['csv-imports'],
    queryFn: () => api.get<CsvImport[]>('/csv-imports'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete<CsvImport>(`/csv-imports/${id}`),
    onSuccess: () => {
      // Un import supprimé peut couvrir n'importe quelle période — on rafraîchit large.
      qc.invalidateQueries({ queryKey: ['csv-imports'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['budget-report'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
      qc.invalidateQueries({ queryKey: ['tx-day'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  function handleDelete(imp: CsvImport) {
    const nb = imp.txCount ?? 0;
    const msg =
      nb > 0
        ? `Supprimer l'import « ${imp.filename} » ?\n\n${nb} transaction${
            nb > 1 ? 's' : ''
          } seront supprimées définitivement (les recatégorisations manuelles seront perdues).`
        : `Supprimer l'import « ${imp.filename} » ?`;
    if (window.confirm(msg)) del.mutate(imp.id);
  }

  return (
    <section className="mt-10">
      <header className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Historique des imports
        </h2>
        {data && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {data.length} import{data.length > 1 ? 's' : ''}
          </span>
        )}
      </header>

      {isLoading && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
      )}
      {error && (
        <p className="text-sm text-red-600">
          Erreur : {(error as Error).message}
        </p>
      )}
      {del.error && (
        <p className="mb-2 text-sm text-red-600">
          Erreur suppression : {(del.error as Error).message}
        </p>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Aucun import pour le moment.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950/60 text-[11px] uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold">
              <tr>
                <th className="text-left px-4 py-2.5">Importé le</th>
                <th className="text-left px-4 py-2.5">Fichier</th>
                <th className="text-left px-4 py-2.5">Compte</th>
                <th className="text-left px-4 py-2.5">Période transactions</th>
                <th className="text-right px-4 py-2.5">Transactions</th>
                <th className="text-left px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((imp) => (
                <tr
                  key={imp.id}
                  className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
                >
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap">
                    {formatDateTime(imp.confirmedAt ?? imp.uploadedAt)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-gray-900 dark:text-gray-100 max-w-[220px] truncate"
                    title={imp.filename}
                  >
                    {imp.filename}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                    {imp.account?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {formatRange(imp.minPostedAt, imp.maxPostedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                    {imp.txCount ?? 0}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={imp.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(imp)}
                      disabled={del.isPending && del.variables === imp.id}
                      className="text-xs px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50 disabled:cursor-wait"
                      title="Supprimer cet import et toutes ses transactions"
                    >
                      {del.isPending && del.variables === imp.id
                        ? 'Suppression…'
                        : 'Supprimer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: CsvImport['status'] }) {
  const cls =
    status === 'CONFIRMED'
      ? 'bg-cat-green-bg text-cat-green-fg dark:bg-cat-green/15 dark:text-cat-green'
      : status === 'MAPPING' || status === 'PENDING'
        ? 'bg-cat-amber-bg text-cat-amber-fg dark:bg-cat-amber/15 dark:text-cat-amber'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400';
  const label =
    status === 'CONFIRMED'
      ? 'Confirmé'
      : status === 'MAPPING'
        ? 'En cours'
        : status === 'PENDING'
          ? 'En attente'
          : 'Annulé';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRange(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return '—';
  if (from === to) return formatDate(from);
  return `${formatDate(from)} → ${formatDate(to)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('fr-CA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

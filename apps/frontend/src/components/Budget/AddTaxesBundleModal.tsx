import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, CreateTaxesBundleResult, TaxBundle, TaxBundleKind } from '../../lib/api';

/**
 * Modal groupé "Ajouter mes taxes" : entrée du total annuel unique, création
 * automatique des 2 (scolaire) ou 4 (municipale) BudgetItems avec le montant
 * réparti également et les dates figées configurées côté backend.
 *
 * L'aperçu des versements se met à jour en temps réel selon le total saisi.
 */
export function AddTaxesBundleModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const currentYear = new Date().getFullYear();

  const [kind, setKind] = useState<TaxBundleKind>('municipale');
  const [annualTotal, setAnnualTotal] = useState<string>('');
  const [year, setYear] = useState<number>(currentYear);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: bundles } = useQuery({
    queryKey: ['tax-bundles'],
    queryFn: () => api.get<TaxBundle[]>('/budget/tax-bundles'),
  });

  const selected = useMemo(
    () => bundles?.find((b) => b.kind === kind),
    [bundles, kind],
  );

  // Quand l'utilisateur change de bundle, propose le total par défaut.
  useEffect(() => {
    if (selected && !annualTotal) {
      setAnnualTotal(String(selected.defaultAnnualAmount));
    }
  }, [selected, annualTotal]);

  const totalNum = Number(annualTotal) || 0;
  const perInstallment = selected && selected.dates.length > 0
    ? Math.round((totalNum / selected.dates.length) * 100) / 100
    : 0;

  const save = useMutation({
    mutationFn: () =>
      api.post<CreateTaxesBundleResult>('/budget/tax-bundles', {
        kind,
        annualTotal: totalNum,
        year,
      }),
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const canSubmit = totalNum > 0 && !!selected && !save.isPending;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">Ajouter mes taxes</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-400 text-xl leading-none px-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Entre le total annuel de la facture. On crée automatiquement les
            versements aux dates fixes de la municipalité / CSSDHR.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Taxe">
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as TaxBundleKind);
                  setAnnualTotal('');
                }}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900"
              >
                {(bundles ?? []).map((b) => (
                  <option key={b.kind} value={b.kind}>
                    {b.emoji} {b.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Année">
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm tabular-nums"
              />
            </Field>
          </div>

          <Field label="Total annuel">
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={annualTotal}
                onChange={(e) => setAnnualTotal(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm tabular-nums pr-8"
                placeholder="0.00"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                $
              </span>
            </div>
          </Field>

          {/* Aperçu des versements calculés */}
          {selected && (
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                Aperçu — {selected.dates.length} versement
                {selected.dates.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-1">
                {selected.dates.map((d, idx) => {
                  const isLast = idx === selected.dates.length - 1;
                  const amount = isLast
                    ? Math.round((totalNum - perInstallment * (selected.dates.length - 1)) * 100) / 100
                    : perInstallment;
                  return (
                    <div
                      key={idx}
                      className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                    >
                      <span>{d.label}</span>
                      <span className="tabular-nums font-medium">
                        {amount.toLocaleString('fr-CA', { minimumFractionDigits: 2 })} $
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-sm font-semibold pt-1 border-t border-gray-200 dark:border-gray-800">
                <span>Total</span>
                <span className="tabular-nums">
                  {totalNum.toLocaleString('fr-CA', { minimumFractionDigits: 2 })} $
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-3">
              {error}
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              setError(null);
              save.mutate();
            }}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm rounded-md bg-cat-teal-fg text-white hover:bg-cat-teal-fg/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {save.isPending ? 'Création…' : 'Créer les versements'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

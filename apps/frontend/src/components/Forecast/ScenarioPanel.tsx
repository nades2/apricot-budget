import { useState } from 'react';
import { Hypothesis } from '../../lib/scenario';
import { formatCurrency } from '../../lib/format';

/**
 * ScenarioPanel v2 — compact par defaut, formulaire cache derriere un bouton.
 * L emprise visuelle passe d une grosse section a une ligne quand il n y a
 * rien a afficher, ce qui laisse toute la place au graphique.
 */
export function ScenarioPanel({
  hypotheses,
  windowFrom,
  windowTo,
  onAdd,
  onRemove,
  onClear,
  showOverlay,
  onToggleOverlay,
}: {
  hypotheses: Hypothesis[];
  windowFrom: string;
  windowTo: string;
  onAdd: (h: Omit<Hypothesis, 'id'>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  showOverlay: boolean;
  onToggleOverlay: (v: boolean) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState(windowFrom);
  const [amount, setAmount] = useState('100');
  const [direction, setDirection] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [label, setLabel] = useState('');

  const canAdd = amount && Number(amount) > 0 && date >= windowFrom && date <= windowTo;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      date,
      amount,
      direction,
      label: label.trim() || (direction === 'INCOME' ? 'Revenu' : 'Depense'),
    });
    setLabel('');
    setAmount('100');
  };

  return (
    <section className="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 mb-4">
      {/* --- Barre compacte --- */}
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <i
            className="ti ti-flask"
            style={{ color: 'var(--scenario-fg)' }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Scenarios what-if
          </span>
          {hypotheses.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'var(--scenario-soft)', color: 'var(--scenario-fg)' }}
            >
              {hypotheses.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {hypotheses.length > 0 && (
            <label className="text-xs flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => onToggleOverlay(e.target.checked)}
                style={{ accentColor: 'var(--scenario-fg)' }}
              />
              <span className="text-gray-600 dark:text-gray-300">Afficher</span>
            </label>
          )}
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="text-xs px-2.5 py-1 rounded font-medium transition"
            style={{ backgroundColor: 'var(--scenario-soft)', color: 'var(--scenario-fg)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--scenario-soft-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--scenario-soft)')}
          >
            {formOpen ? 'Fermer' : '+ Ajouter'}
          </button>
        </div>
      </header>

      {/* --- Formulaire deroulant --- */}
      {formOpen && (
        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-3">
            <label className="text-xs col-span-2 md:col-span-2">
              <span className="block text-gray-500 dark:text-gray-400 mb-1">Libelle</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: nouvelle voiture"
                className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1"
                autoFocus
              />
            </label>

            <label className="text-xs">
              <span className="block text-gray-500 dark:text-gray-400 mb-1">Date</span>
              <input
                type="date"
                value={date}
                min={windowFrom}
                max={windowTo}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1 tabular-nums"
              />
            </label>

            <label className="text-xs">
              <span className="block text-gray-500 dark:text-gray-400 mb-1">Montant</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1 tabular-nums"
              />
            </label>

            <label className="text-xs">
              <span className="block text-gray-500 dark:text-gray-400 mb-1">Type</span>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'INCOME' | 'EXPENSE')}
                className="w-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1"
              >
                <option value="EXPENSE">Depense</option>
                <option value="INCOME">Revenu</option>
              </select>
            </label>

            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="text-xs px-3 py-1 rounded font-semibold hover:opacity-90 disabled:opacity-50 self-end transition"
              style={{
                backgroundColor: 'var(--scenario-strong)',
                color: 'var(--scenario-strong-text)',
              }}
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      {/* --- Liste des hypotheses actives --- */}
      {hypotheses.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3">
          <ul className="space-y-1 mb-2">
            {hypotheses.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded bg-gray-50 dark:bg-gray-900"
              >
                <span className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="tabular-nums text-gray-500">{h.date}</span>
                  <span className="truncate">{h.label}</span>
                </span>
                <span
                  className={`tabular-nums font-semibold ${
                    h.direction === 'INCOME'
                      ? 'text-cat-green-fg dark:text-cat-green'
                      : 'text-cat-red-fg dark:text-cat-red'
                  }`}
                >
                  {h.direction === 'INCOME' ? '+' : '-'}
                  {formatCurrency(h.amount, true)}
                </span>
                <button
                  onClick={() => onRemove(h.id)}
                  className="text-gray-400 hover:text-red-500 transition"
                  title="Retirer"
                >
                  <i className="ti ti-x text-sm" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={onClear}
            className="text-[11px] text-gray-500 hover:text-red-500 underline"
          >
            Effacer tout
          </button>
        </div>
      )}
    </section>
  );
}

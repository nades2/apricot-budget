import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, BudgetDirection, BudgetItem, BudgetPreset, BudgetRecurrence, Category } from '../../lib/api';

/**
 * Two-tab modal: pick a preset, or fill in a custom item. The preset picker
 * prefills the form fields and then hands off to the same submit path — so
 * we always end up with a plain BudgetItem POST.
 *
 * When `item` is passed, the modal enters edit mode: it starts on the custom
 * tab prefilled with the item's values, PATCHes on save, and shows a delete
 * button.
 */
export function AddBudgetItemModal({
  item,
  onClose,
  onSaved,
}: {
  item?: BudgetItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;

  const [tab, setTab] = useState<'preset' | 'custom'>(isEdit ? 'custom' : 'preset');

  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [direction, setDirection] = useState<BudgetDirection>(item?.direction ?? 'EXPENSE');
  const [amount, setAmount] = useState(item?.amount ?? '0');
  const [recurrence, setRecurrence] = useState<BudgetRecurrence>(item?.recurrence ?? 'MONTHLY');
  const [anchorDate, setAnchorDate] = useState(item?.anchorDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: presets } = useQuery({
    queryKey: ['budget-presets'],
    queryFn: () => api.get<BudgetPreset[]>('/budget/presets'),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  function applyPreset(p: BudgetPreset) {
    if (!p.categoryId) return;
    setName(p.name);
    setCategoryId(p.categoryId);
    setDirection(p.direction);
    setAmount(String(p.amount));
    setRecurrence(p.recurrence);
    setTab('custom');
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        categoryId,
        name: name.trim(),
        direction,
        amount: Number(amount),
        recurrence,
        anchorDate,
      };
      return isEdit
        ? api.patch(`/budget/items/${item!.id}`, body)
        : api.post('/budget/items', body);
    },
    onSuccess: onSaved,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/budget/items/${item!.id}`),
    onSuccess: onSaved,
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {isEdit ? `Modifier ${item!.name}` : 'Ajouter un poste de budget'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-400 text-xl leading-none px-2" aria-label="Fermer">×</button>
        </header>

        {!isEdit && (
          <div className="flex border-b border-gray-200 dark:border-gray-800 text-sm">
            <TabBtn active={tab === 'preset'} onClick={() => setTab('preset')}>Depuis un modèle</TabBtn>
            <TabBtn active={tab === 'custom'} onClick={() => setTab('custom')}>Personnalisé</TabBtn>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'preset' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(presets ?? []).map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  disabled={!p.categoryId}
                  className="text-left p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-cat-teal hover:bg-cat-teal-bg disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {p.amount} $ · {recurrenceLabel(p.recurrence)}
                      </div>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      p.direction === 'INCOME' ? 'bg-cat-green-bg text-cat-green-fg' : 'bg-cat-red-bg text-cat-red-fg'
                    }`}>
                      {p.direction === 'INCOME' ? 'Revenu' : 'Dépense'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === 'custom' && (
            <div className="space-y-3">
              <Field label="Nom">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Netflix, Loyer, Salaire…"
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Catégorie">
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900">
                  <option value="">— Choisir —</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select value={direction} onChange={(e) => setDirection(e.target.value as BudgetDirection)} className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900">
                    <option value="EXPENSE">Dépense</option>
                    <option value="INCOME">Revenu</option>
                  </select>
                </Field>
                <Field label="Récurrence">
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as BudgetRecurrence)} className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900">
                    <option value="DAILY">Quotidienne</option>
                    <option value="WEEKLY">Hebdomadaire</option>
                    <option value="BIWEEKLY">Bi-hebdomadaire</option>
                    <option value="MONTHLY">Mensuelle</option>
                    <option value="YEARLY">Annuelle</option>
                    <option value="ONCE">Une seule fois</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Montant prévu">
                  <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm tabular-nums" />
                </Field>
                <Field label="Date d'ancrage">
                  <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm" />
                </Field>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                La date d'ancrage détermine le jour où le poste se répète. Ex: pour "Loyer mensuel"
                le 1<sup>er</sup>, choisis un 1<sup>er</sup> — ça se répétera tous les 1<sup>er</sup> du mois.
              </p>

              {(save.error || remove.error) && (
                <p className="text-sm text-cat-red-fg dark:text-cat-red bg-cat-red-bg dark:bg-cat-red/15 rounded-md px-3 py-2">
                  {((save.error ?? remove.error) as Error).message}
                </p>
              )}
            </div>
          )}
        </div>

        {tab === 'custom' && (
          <footer className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
            {isEdit ? (
              confirmDelete ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-cat-red-fg dark:text-cat-red">Supprimer ce poste ?</span>
                  <button
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                    className="px-3 py-1 bg-cat-red-fg text-white rounded text-xs font-medium"
                  >
                    {remove.isPending ? '…' : 'Oui, supprimer'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-600 dark:text-gray-400">Annuler</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm text-cat-red-fg dark:text-cat-red hover:underline"
                >
                  Supprimer
                </button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800">Annuler</button>
              <button
                onClick={() => save.mutate()}
                disabled={!name.trim() || !categoryId || save.isPending}
                className="px-4 py-1.5 bg-cat-teal-fg text-white rounded-md text-sm font-medium disabled:opacity-40 hover:bg-cat-teal-fg/90"
              >
                {save.isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le poste'}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 border-b-2 ${active ? 'border-cat-teal text-cat-teal-fg font-medium' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800'}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium block mb-1">{label}</span>
      {children}
    </label>
  );
}

function recurrenceLabel(r: BudgetRecurrence): string {
  return {
    DAILY: 'quotidien', WEEKLY: 'hebdo', BIWEEKLY: 'bi-hebdo',
    MONTHLY: 'mensuel', YEARLY: 'annuel', ONCE: 'une fois',
  }[r];
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Category, CategoryDirection, api } from '../lib/api';

// Rampes de couleurs disponibles dans le design system (voir tailwind.config).
const COLOR_RAMPS = [
  'coral', 'amber', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray',
] as const;
type ColorRamp = typeof COLOR_RAMPS[number];

const DIRECTION_LABELS: Record<CategoryDirection, { label: string; hint: string; icon: string }> = {
  EXPENSE:  { label: 'Depenses',        hint: 'sortie d argent',           icon: 'ti-arrow-down-right' },
  INCOME:   { label: 'Revenus',         hint: 'entree d argent',           icon: 'ti-arrow-up-right' },
  TRANSFER: { label: 'Transferts',      hint: 'entre comptes',             icon: 'ti-transfer' },
  NEUTRAL:  { label: 'Neutres',         hint: 'sans impact sur le budget', icon: 'ti-circle' },
};

// Quelques icones populaires — la liste est plus large chez Tabler mais 40
// suffisent pour la plupart des besoins. L utilisateur peut aussi taper
// n importe quel nom d icone Tabler valide.
const ICON_SUGGESTIONS = [
  'shopping-cart', 'home', 'car', 'bolt', 'shield', 'plane',
  'device-gamepad', 'shopping-bag', 'hanger', 'gas-station', 'car-crash',
  'briefcase', 'building-bank', 'wallet', 'coin', 'gift', 'heart',
  'medical-cross', 'cake', 'coffee', 'tools-kitchen-2', 'pizza',
  'book', 'school', 'movie', 'music', 'ticket', 'palette',
  'wifi', 'phone', 'device-tv', 'dog', 'cat',
  'flame', 'droplet', 'trash', 'recycle', 'leaf', 'tree',
] as const;

/**
 * CRUD Categories.
 *  - Categories systeme (userId = null, isSystem = true) apparaissent grisees,
 *    non modifiables.
 *  - Categories utilisateur : editables, supprimables.
 *  - Groupees par direction pour une revue rapide.
 */
export function CategoriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const grouped = useMemo(() => {
    const map: Record<CategoryDirection, Category[]> = {
      EXPENSE: [], INCOME: [], TRANSFER: [], NEUTRAL: [],
    };
    for (const c of categories ?? []) map[c.direction].push(c);
    return map;
  }, [categories]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Categories
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Organise tes transactions. Les categories systeme sont en lecture seule ;
            tes propres categories sont modifiables et supprimables.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium hover:bg-cat-teal-fg/90 transition inline-flex items-center gap-1.5"
        >
          <i className="ti ti-plus" aria-hidden="true" />
          Nouvelle categorie
        </button>
      </header>

      {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>}

      {categories && (
        <div className="space-y-6">
          {(Object.keys(DIRECTION_LABELS) as CategoryDirection[]).map((dir) => {
            const items = grouped[dir];
            if (items.length === 0) return null;
            const info = DIRECTION_LABELS[dir];
            return (
              <section key={dir}>
                <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  <i className={`ti ${info.icon}`} aria-hidden="true" />
                  {info.label}
                  <span className="text-xs text-gray-400 font-normal">
                    {items.length} · {info.hint}
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {items.map((c) => (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      onEdit={() => setEditing(c)}
                      onDelete={() => {
                        if (confirm(`Supprimer la categorie "${c.name}" ?`)) {
                          removeMut.mutate(c.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showAdd && (
        <CategoryModal
          mode="create"
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            invalidate();
            setShowAdd(false);
          }}
        />
      )}
      {editing && (
        <CategoryModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ramp = category.color ?? 'gray';
  return (
    <div
      className="group flex items-center gap-3 border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2 bg-white dark:bg-gray-950 hover:border-gray-300 dark:hover:border-gray-700 transition"
    >
      <span
        className={`w-9 h-9 rounded-md flex items-center justify-center bg-cat-${ramp}-bg text-cat-${ramp}-fg shrink-0`}
        aria-hidden="true"
      >
        <i className={`ti ${category.icon ? `ti-${category.icon}` : 'ti-tag'} text-lg`} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {category.name}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {category.slug}
        </div>
      </div>

      {category.isSystem ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Systeme
        </span>
      ) : (
        <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
          <button
            onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            title="Modifier"
          >
            <i className="ti ti-pencil text-sm" aria-hidden="true" />
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-cat-red-bg text-gray-500 dark:text-gray-400 hover:text-cat-red-fg"
            title="Supprimer"
          >
            <i className="ti ti-trash text-sm" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Modale creation/edition
// ---------------------------------------------------------------------------

function CategoryModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  initial?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [direction, setDirection] = useState<CategoryDirection>(initial?.direction ?? 'EXPENSE');
  const [icon, setIcon] = useState(initial?.icon ?? 'tag');
  const [color, setColor] = useState<ColorRamp>((initial?.color as ColorRamp) ?? 'teal');

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      mode === 'edit' && initial
        ? api.patch(`/categories/${initial.id}`, payload)
        : api.post('/categories', payload),
    onSuccess: onSaved,
  });

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    mutation.mutate({
      name: name.trim(),
      direction,
      icon: icon.trim() || undefined,
      color,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'create' ? 'Nouvelle categorie' : `Modifier "${initial?.name}"`}
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full text-sm rounded px-2.5 py-1.5
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
              placeholder="Ex: Cafes / Impots / Loisirs enfants"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Direction</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CategoryDirection)}
              className="w-full text-sm rounded px-2.5 py-1.5
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100"
            >
              <option value="EXPENSE">Depense</option>
              <option value="INCOME">Revenu</option>
              <option value="TRANSFER">Transfert entre comptes</option>
              <option value="NEUTRAL">Neutre</option>
            </select>
          </label>

          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-2">Couleur</span>
            <div className="flex flex-wrap gap-2">
              {COLOR_RAMPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-md bg-cat-${c}-bg border-2 transition ${
                    color === c
                      ? `border-cat-${c}-fg ring-2 ring-offset-2 ring-cat-${c}-fg dark:ring-offset-gray-950`
                      : 'border-transparent'
                  }`}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-2">Icone</span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="ex: shopping-cart, home, ..."
              className="w-full text-sm rounded px-2.5 py-1.5 mb-2
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100 font-mono"
            />
            <div className="grid grid-cols-8 gap-1.5 max-h-32 overflow-y-auto p-1 border border-gray-100 dark:border-gray-800 rounded">
              {ICON_SUGGESTIONS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  title={i}
                  className={`w-8 h-8 flex items-center justify-center rounded transition ${
                    icon === i
                      ? `bg-cat-${color}-bg text-cat-${color}-fg`
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <i className={`ti ti-${i}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {/* Apercu */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-2">Apercu</span>
            <div className="flex items-center gap-3 border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2 bg-white dark:bg-gray-900">
              <span
                className={`w-9 h-9 rounded-md flex items-center justify-center bg-cat-${color}-bg text-cat-${color}-fg shrink-0`}
              >
                <i className={`ti ${icon ? `ti-${icon}` : 'ti-tag'} text-lg`} />
              </span>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {name || 'Nom de la categorie'}
              </div>
            </div>
          </div>

          {mutation.error && (
            <p className="text-xs text-cat-red-fg bg-cat-red-bg rounded p-2">
              {(mutation.error as Error).message}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending}
            className="px-4 py-1.5 text-sm rounded bg-cat-teal-fg text-white font-medium hover:bg-cat-teal-fg/90 disabled:opacity-50"
          >
            {mutation.isPending
              ? 'Enregistrement...'
              : mode === 'create' ? 'Creer' : 'Enregistrer'}
          </button>
        </footer>
      </div>
    </div>
  );
}

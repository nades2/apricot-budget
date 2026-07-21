import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, BudgetItem, BudgetReport, UnbudgetedLine } from '../lib/api';
import { VerdictBanner } from '../components/Budget/VerdictBanner';
import { BudgetLineTable } from '../components/Budget/BudgetLineTable';
import { UnbudgetedTable } from '../components/Budget/UnbudgetedTable';
import { UnbudgetedDetailModal } from '../components/Budget/UnbudgetedDetailModal';
import { AddBudgetItemModal } from '../components/Budget/AddBudgetItemModal';

/** Current month as YYYY-MM in the user's local time. */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const s = d.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function BudgetPage() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [detailLine, setDetailLine] = useState<{
    line: UnbudgetedLine;
    direction: 'EXPENSE' | 'INCOME';
  } | null>(null);
  const qc = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ['budget-report', month],
    queryFn: () => api.get<BudgetReport>(`/budget/report?month=${month}`),
  });

  // Fetched once, used to resolve full item data when the user clicks a row.
  const { data: items } = useQuery({
    queryKey: ['budget-items'],
    queryFn: () => api.get<BudgetItem[]>('/budget/items'),
  });

  function openEdit(itemId: string) {
    const found = items?.find((i) => i.id === itemId);
    if (found) setEditingItem(found);
  }

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['budget-report'] });
    qc.invalidateQueries({ queryKey: ['budget-items'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Budget · {monthLabel(month)}</h1>
          <p className="text-sm text-gray-500 mt-1">Prévu vs. réel, par poste et par catégorie</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">← mois</button>
          {month !== currentMonth() && (
            <button onClick={() => setMonth(currentMonth())} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
              Ce mois-ci
            </button>
          )}
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            mois →
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="ml-2 px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium hover:bg-cat-teal-fg/90"
          >
            + Poste
          </button>
        </div>
      </header>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}

      {report && (
        <div className="space-y-6">
          <VerdictBanner report={report} />

          <BudgetLineTable
            title="Revenus"
            lines={report.income.lines}
            planned={report.income.planned}
            actual={report.income.actual}
            direction="INCOME"
            onEdit={openEdit}
          />

          <BudgetLineTable
            title="Dépenses"
            lines={report.expense.lines}
            planned={report.expense.planned}
            actual={report.expense.actual}
            direction="EXPENSE"
            onEdit={openEdit}
          />

          <UnbudgetedTable
            title="Hors budget · Dépenses"
            lines={report.unbudgetedExpense.lines}
            total={report.unbudgetedExpense.total}
            direction="EXPENSE"
            onRowClick={(line) => setDetailLine({ line, direction: 'EXPENSE' })}
          />

          <UnbudgetedTable
            title="Hors budget · Revenus"
            lines={report.unbudgetedIncome.lines}
            total={report.unbudgetedIncome.total}
            direction="INCOME"
            onRowClick={(line) => setDetailLine({ line, direction: 'INCOME' })}
          />
        </div>
      )}

      {detailLine && (
        <UnbudgetedDetailModal
          month={month}
          categoryId={detailLine.line.categoryId}
          categoryName={detailLine.line.categoryName}
          direction={detailLine.direction}
          onClose={() => setDetailLine(null)}
        />
      )}

      {showAdd && (
        <AddBudgetItemModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            invalidateAll();
            setShowAdd(false);
          }}
        />
      )}

      {editingItem && (
        <AddBudgetItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            invalidateAll();
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

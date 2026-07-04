import { Link } from 'react-router-dom';
import { CsvImport } from '../../lib/api';

export function StepConfirm({
  csvImport,
  onNew,
}: {
  csvImport: CsvImport;
  onNew: () => void;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg
                    bg-white dark:bg-gray-950
                    p-8 space-y-4 text-center">
      <div className="w-16 h-16 rounded-full bg-cat-green-bg text-cat-green-fg
                      flex items-center justify-center mx-auto text-3xl">
        <i className="ti ti-check" aria-hidden="true" />
      </div>

      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Import confirme
      </h2>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        <b className="text-gray-900 dark:text-gray-100 tabular-nums">
          {csvImport.mappedCount}
        </b>{' '}
        transactions inserees depuis{' '}
        <code className="text-xs px-1.5 py-0.5 rounded
                         bg-gray-100 dark:bg-gray-800
                         text-gray-700 dark:text-gray-300
                         font-mono">
          {csvImport.filename}
        </code>.
      </p>

      <div className="flex justify-center gap-3 pt-2">
        <Link
          to="/calendar"
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium
                     hover:bg-cat-teal-fg/90 transition"
        >
          Voir le calendrier
        </Link>
        <button
          onClick={onNew}
          className="px-4 py-2 rounded-md text-sm
                     border border-gray-300 dark:border-gray-700
                     text-gray-700 dark:text-gray-300
                     hover:bg-gray-50 dark:hover:bg-gray-800
                     transition"
        >
          Importer un autre CSV
        </button>
      </div>
    </div>
  );
}

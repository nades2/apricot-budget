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
    <div className="border border-gray-200 rounded-lg bg-white p-6 space-y-4 text-center">
      <div className="w-14 h-14 rounded-full bg-cat-green-bg text-cat-green-fg flex items-center justify-center mx-auto text-3xl">
        ✓
      </div>
      <h2 className="text-xl font-semibold">Import confirmé</h2>
      <p className="text-sm text-gray-600">
        <b>{csvImport.mappedCount}</b> transactions insérées depuis <code className="text-xs">{csvImport.filename}</code>.
      </p>

      <div className="flex justify-center gap-3 pt-2">
        <Link
          to="/calendar"
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium hover:bg-cat-teal-fg/90"
        >
          Voir le calendrier
        </Link>
        <button
          onClick={onNew}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
        >
          Importer un autre CSV
        </button>
      </div>
    </div>
  );
}

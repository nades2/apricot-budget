import { ImportWizard } from '../components/Import/ImportWizard';
import { ImportHistory } from '../components/Import/ImportHistory';

export function ImportPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Importer un CSV BNC
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload &middot; Revue des mappings &middot; Confirmation
        </p>
      </header>
      <ImportWizard />
      <ImportHistory />
    </div>
  );
}

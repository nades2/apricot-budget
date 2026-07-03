import { ImportWizard } from '../components/Import/ImportWizard';

export function ImportPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Importer un CSV BNC</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload · Revue des mappings · Confirmation
        </p>
      </header>
      <ImportWizard />
    </div>
  );
}

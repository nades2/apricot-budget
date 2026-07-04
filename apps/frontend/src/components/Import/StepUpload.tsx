import { useState, useRef, DragEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, Account, CsvImport } from '../../lib/api';

export function StepUpload({ onDone }: { onDone: (imp: CsvImport) => void }) {
  const [accountId, setAccountId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: accounts } = useQuery({
    queryKey: ['accounts', 'ASSET'],
    queryFn: () => api.get<Account[]>('/accounts?type=ASSET'),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!accountId || !file) throw new Error('Selectionne un compte et un fichier CSV.');
      const form = new FormData();
      form.append('file', file);
      return api.postForm<CsvImport>(`/csv-imports?accountId=${accountId}`, form);
    },
    onSuccess: onDone,
  });

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  return (
    <div className="space-y-6">
      <section>
        <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
          Compte de destination
        </label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full max-w-md rounded-md px-3 py-2 text-sm
                     border border-gray-300 dark:border-gray-700
                     bg-white dark:bg-gray-900
                     text-gray-900 dark:text-gray-100
                     focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
        >
          <option value="">-- Choisir un compte --</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} - {a.institution ?? '-'}
            </option>
          ))}
        </select>
      </section>

      <section>
        <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
          Fichier CSV
        </label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
            isDragging
              ? 'border-cat-teal-fg bg-cat-teal-bg'
              : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {file.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {(file.size / 1024).toFixed(1)} Ko
              </div>
              <div className="text-xs text-cat-teal-fg mt-2">
                Cliquer pour en choisir un autre
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Glisse-depose ton fichier CSV ici, ou clique pour choisir.
            </div>
          )}
        </div>
      </section>

      {upload.error && (
        <p className="text-sm text-cat-red-fg bg-cat-red-bg rounded-md px-3 py-2">
          {(upload.error as Error).message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => upload.mutate()}
          disabled={!accountId || !file || upload.isPending}
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed
                     hover:bg-cat-teal-fg/90 transition"
        >
          {upload.isPending ? 'Envoi...' : 'Uploader et analyser ->'}
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { CsvImport } from '../../lib/api';
import { StepUpload } from './StepUpload';
import { StepMapping } from './StepMapping';
import { StepConfirm } from './StepConfirm';

type Step = 'upload' | 'mapping' | 'done';

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [imp, setImp] = useState<CsvImport | null>(null);

  function reset() {
    setImp(null);
    setStep('upload');
  }

  return (
    <div>
      <Stepper current={step} />

      {step === 'upload' && (
        <StepUpload
          onDone={(created) => {
            setImp(created);
            setStep('mapping');
          }}
        />
      )}

      {step === 'mapping' && imp && (
        <StepMapping
          csvImport={imp}
          onCancel={reset}
          onConfirmed={(updated) => {
            setImp(updated);
            setStep('done');
          }}
        />
      )}

      {step === 'done' && imp && <StepConfirm csvImport={imp} onNew={reset} />}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Revue' },
    { key: 'done', label: 'Confirmation' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center gap-2 mb-6 text-sm flex-wrap">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                done
                  ? 'bg-cat-green-fg text-white'
                  : active
                  ? 'bg-cat-teal-bg text-cat-teal-fg border border-cat-teal-fg'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {done ? <i className="ti ti-check" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={
                i <= currentIdx
                  ? 'font-medium text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-500'
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-gray-300 dark:text-gray-700 mx-2">-&gt;</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

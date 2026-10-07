import React from 'react';
import type { SearchParams } from '../utils/types';

interface Props {
  params: SearchParams;
  onChange: (p: SearchParams) => void;
  onCalculate: () => void;
  busy: boolean;
}

const Field: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}> = ({ label, value, onChange, min, max, step = 10 }) => (
  <label className="block text-xs">
    <span className="text-gray-500">{label}</span>
    <input
      type="number"
      className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-sm focus:border-teal-500 focus:outline-none"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </label>
);

const SearchParamsForm: React.FC<Props> = ({ params, onChange, onCalculate, busy }) => {
  const [advanced, setAdvanced] = React.useState(false);
  const set = <K extends keyof SearchParams>(k: K, v: SearchParams[K]) => onChange({ ...params, [k]: v });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-800">Параметры подбора</h2>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Запас m, мм" value={params.margin} onChange={(v) => set('margin', v)} min={0} step={10} />
        <Field label="Секций N" value={params.sectionCount} onChange={(v) => set('sectionCount', Math.max(1, Math.min(3, v)))} min={1} max={3} step={1} />
        <Field label="Секция от, мм" value={params.sectionMin} onChange={(v) => set('sectionMin', v)} min={1000} />
        <Field label="Секция до, мм" value={params.sectionMax} onChange={(v) => set('sectionMax', v)} min={1000} />
        <Field label="Зазор от, мм" value={params.gapMin} onChange={(v) => set('gapMin', v)} min={0} />
        <Field label="Зазор до, мм" value={params.gapMax} onChange={(v) => set('gapMax', v)} min={0} />
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={params.equalSections}
          onChange={(e) => set('equalSections', e.target.checked)}
        />
        Равные секции и зазоры
      </label>

      <button
        onClick={() => setAdvanced((v) => !v)}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        {advanced ? '− Скрыть уточнения' : '+ Уточнить перебор'}
      </button>

      {advanced && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Шаг секции, мм" value={params.sectionStep} onChange={(v) => set('sectionStep', Math.max(10, v))} min={10} />
          <Field label="Шаг зазора, мм" value={params.gapStep} onChange={(v) => set('gapStep', Math.max(10, v))} min={10} />
          <Field label="Макс. длина, мм" value={params.totalMax} onChange={(v) => set('totalMax', v)} min={2000} />
          <Field label="Нижний предел m, мм" value={params.marginFloor} onChange={(v) => set('marginFloor', v)} min={0} />
        </div>
      )}

      <button
        onClick={onCalculate}
        disabled={busy}
        className="w-full rounded-md bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 px-4 text-sm"
      >
        {busy ? 'Подбор…' : 'Подобрать конфигурацию'}
      </button>
    </div>
  );
};

export default SearchParamsForm;

import React from 'react';
import type { WagonType } from '../utils/types';
import { WAGON_TYPES } from '../data/presets';
import { axleOffsets } from '../utils/geometry';
import {
  downloadCustomWagons,
  isCustomWagon,
  parseCustomWagons,
  wagonProblems,
} from '../utils/customWagons';

/** Три геометрических параметра вагона, из которых строится расчёт. */
const FIELDS = [
  { key: 'baseMm', sym: 'B', label: 'База вагона', hint: 'расстояние между центрами тележек' },
  { key: 'couplerMm', sym: 'C', label: 'Габарит по сцепкам', hint: 'длина по осям сцепок' },
  { key: 'bogieMm', sym: 'b', label: 'Колёсная база', hint: 'расстояние между осями тележки' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

interface Draft {
  name: string;
  baseMm: number;
  couplerMm: number;
  bogieMm: number;
}

const EMPTY: Draft = { name: '', baseMm: 9120, couplerMm: 14720, bogieMm: 1800 };

const WagonSelector: React.FC<{ selected: WagonType[]; onChange: (wagons: WagonType[]) => void }> = ({
  selected,
  onChange,
}) => {
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [ioNote, setIoNote] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const customWagons = selected.filter(isCustomWagon);
  const editing = editingId ? selected.find((w) => w.id === editingId) ?? null : null;
  const problems = wagonProblems(draft);
  const valid = problems.length === 0;

  const togglePreset = (w: WagonType) => {
    onChange(selected.some((s) => s.id === w.id) ? selected.filter((s) => s.id !== w.id) : [...selected, w]);
  };

  const startEdit = (w: WagonType) => {
    setDraft({ name: w.name, baseMm: w.baseMm, couplerMm: w.couplerMm, bogieMm: w.bogieMm });
    setEditingId(w.id);
    setTouched(false);
  };

  const cancel = () => {
    setDraft(EMPTY);
    setEditingId(null);
    setTouched(false);
  };

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const name = draft.name.trim() || (editing ? editing.name : 'Свой вагон');
    const dims = { baseMm: draft.baseMm, couplerMm: draft.couplerMm, bogieMm: draft.bogieMm };
    if (editing) {
      onChange(selected.map((w) => (w.id === editing.id ? { ...w, name, ...dims } : w)));
    } else {
      onChange([...selected, { id: `custom-${Date.now()}`, name, ...dims }]);
      setDraft(EMPTY);
      setIoNote(null);
    }
    setEditingId(null);
    setTouched(false);
  };

  const remove = (id: string) => {
    onChange(selected.filter((w) => w.id !== id));
    if (editingId === id) cancel();
  };

  /** Импорт из текстового файла. Повторный импорт одного и того же не плодит дубли. */
  const importFile = async (file: File) => {
    let added = 0;
    let duplicated = 0;
    let skipped = 0;
    try {
      const { wagons, skipped: bad } = parseCustomWagons(await file.text());
      skipped = bad.length;
      const byId = new Map(selected.map((w) => [w.id, w]));
      const byName = new Map(selected.map((w) => [w.name.trim().toLowerCase(), w]));
      for (const w of wagons) {
        const twin = byId.get(w.id) ?? byName.get(w.name.trim().toLowerCase());
        if (twin) {
          // уже есть такой же — обновляем значения, чтобы файл был источником правды
          byId.set(twin.id, { ...twin, ...w, id: twin.id });
          duplicated++;
        } else {
          byId.set(w.id, w);
          added++;
        }
      }
      onChange([...byId.values()]);
      const parts = [`добавлено: ${added}`];
      if (duplicated > 0) parts.push(`обновлено: ${duplicated}`);
      if (skipped > 0) parts.push(`пропущено строк: ${skipped}`);
      setIoNote(parts.join(', '));
    } catch {
      setIoNote('Не удалось прочитать файл');
    }
  };

  const set = (k: FieldKey | 'name', v: number | string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-800">Вагоны</h2>
        <span className="text-xs text-gray-400">выбрано {selected.length}</span>
      </div>

      {/* Пресеты */}
      <div className="flex flex-wrap gap-1.5">
        {WAGON_TYPES.map((w) => {
          const on = selected.some((s) => s.id === w.id);
          return (
            <label
              key={w.id}
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 cursor-pointer text-xs transition-colors ${
                on ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
              title={`B=${w.baseMm} C=${w.couplerMm} b=${w.bogieMm}`}
            >
              <input type="checkbox" checked={on} onChange={() => togglePreset(w)} className="h-3 w-3" />
              {w.name}
            </label>
          );
        })}
      </div>

      {/* Свои вагоны + файловый обмен */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            свои вагоны{customWagons.length > 0 ? `: ${customWagons.length}` : ''}
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-teal-700 hover:underline"
            title="Загрузить список из текстового файла"
          >
            из файла
          </button>
          <button
            onClick={() => downloadCustomWagons(customWagons)}
            disabled={customWagons.length === 0}
            className={`text-xs ${customWagons.length === 0 ? 'text-gray-300' : 'text-teal-700 hover:underline'}`}
            title="Сохранить список в текстовый файл moy-vagony.txt"
          >
            в файл
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              // сброс, иначе повторный выбор того же файла не даст события change
              e.target.value = '';
            }}
          />
        </div>

        {ioNote && <p className="text-[11px] text-gray-500">{ioNote}</p>}

        {customWagons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {customWagons.map((w) => (
              <span
                key={w.id}
                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                  editingId === w.id ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}
                title={`B=${w.baseMm} C=${w.couplerMm} b=${w.bogieMm}`}
              >
                <button onClick={() => startEdit(w)} className="hover:text-teal-700" title="Изменить параметры">
                  {w.name}
                </button>
                <button onClick={() => remove(w.id)} className="text-gray-400 hover:text-red-500" aria-label="Удалить">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Ввод нового вагона */}
      <div className="rounded border border-gray-200 bg-gray-50 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">
            {editing ? `Изменение: ${editing.name}` : 'Новый вагон'}
          </span>
          {editing && (
            <button onClick={cancel} className="text-xs text-gray-500 hover:text-gray-700">
              отмена
            </button>
          )}
        </div>

        <label className="block text-xs">
          <span className="text-gray-500">Название</span>
          <input
            type="text"
            className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-sm focus:border-teal-500 focus:outline-none"
            placeholder="например, вагон РУМН-2337360"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>

        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs">
            <span className="text-gray-500">
              <b className="italic font-mono text-gray-700">{f.sym}</b> — {f.label}, мм
            </span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-sm focus:border-teal-500 focus:outline-none"
              value={draft[f.key]}
              min={0}
              step={10}
              onChange={(e) => set(f.key, Number(e.target.value))}
            />
            <span className="mt-0.5 block text-[11px] text-gray-400">{f.hint}</span>
          </label>
        ))}

        {/* Что получится из этих чисел */}
        {valid && (
          <div className="rounded bg-white px-2 py-1.5 text-[11px] text-gray-500">
            Оси относительно центра:{' '}
            <span className="font-mono text-gray-700">
              {axleOffsets({ id: 'draft', name: '', baseMm: draft.baseMm, couplerMm: draft.couplerMm, bogieMm: draft.bogieMm })
                .map((o) => Math.round(o))
                .join(', ')}{' '}
              мм
            </span>
          </div>
        )}

        {/* Ошибки показываем только после попытки сохранить */}
        {touched && !valid && (
          <ul className="space-y-0.5 text-[11px] text-red-600">
            {problems.map((p) => (
              <li key={p}>— {p}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-1.5">
          <button
            onClick={submit}
            className={`flex-1 rounded border px-2 py-1 text-xs font-medium ${
              valid ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700' : 'border-gray-300 bg-gray-100 text-gray-400'
            }`}
          >
            {editing ? 'Сохранить' : 'Добавить вагон'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WagonSelector;
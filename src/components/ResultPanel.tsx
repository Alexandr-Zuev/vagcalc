import React, { useMemo } from 'react';
import type { SearchResult, SearchStatus, Evaluation } from '../utils/types';
import { mm, mmUnit } from '../utils/format';

interface Props {
  result: SearchResult;
  margin: number;
  selectedWagonId: string;
  onSelectWagon: (id: string) => void;
  nextWagonId: string;
  onSelectNextWagon: (id: string) => void;
  onSelectAlternative: (index: number) => void;
  onDownloadPng: () => void;
}

/* ────────────────────────────────────────────────────────────
   Пары вагонов: зазор от тележки соседа до края платформы
   ──────────────────────────────────────────────────────────── */

interface PairRow {
  /** Комбинация «вагон на платформе / сцепленный сосед» */
  pair: string;
  /** Сторона с наихудшим зазором — она и определяет допуск */
  side: 'left' | 'right';
  /** Ближайшая к платформе ось передней тележки соседа */
  axleX: number;
  clearance: number;
  /** Номера секций (с 1), куда попали оси соседа */
  onSections: number[];
  /** Задет ли сосед хотя бы с одной стороны */
  ok: boolean;
}

/**
 * Комбинации «вагон на платформе / сцепленный сосед».
 *
 * Расчёт проверяет каждую комбинацию выбранных типов с обеих сторон, но в
 * таблице обе стороны схлопнуты в одну строку с худшим зазором — иначе
 * половина строк является дубликатами: расстояние от края платформы до
 * тележки соседа симметрично относительно центра вагона, поэтому зазоры
 * слева и справа равны.
 *
 * Все комбинации перечислены, потому что платформа годна только если годны
 * все. Сортировка: сперва нарушения, затем по возрастанию зазора.
 */
function pairRows(e: Evaluation): PairRow[] {
  const merged = new Map<string, PairRow>();
  for (const n of e.nextChecks) {
    const xs = n.axles.map((a) => a.x).sort((p, q) => p - q);
    const axleX = n.side === 'right' ? xs[0] : xs[xs.length - 1];
    const onSections = [
      ...new Set(
        n.axles.map((a) => a.onSectionIndex).filter((v): v is number => v !== null).map((v) => v + 1),
      ),
    ].sort((p, q) => p - q);
    const row: PairRow = {
      pair: `${n.currentName} / ${n.nextName}`,
      side: n.side,
      axleX,
      clearance: n.minClearance,
      onSections,
      ok: n.ok,
    };
    const prev = merged.get(row.pair);
    merged.set(row.pair, prev && prev.clearance <= row.clearance ? prev : row);
  }

  return [...merged.values()].sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    return a.clearance - b.clearance;
  });
}

/* ────────────────────────────────────────────────────────────
   Статус решения
   ──────────────────────────────────────────────────────────── */

const STATUS: Record<SearchStatus, { chip: string; title: string }> = {
  ok: { chip: 'bg-green-100 text-green-800 border-green-200', title: 'Готово к применению' },
  caution: { chip: 'bg-amber-100 text-amber-800 border-amber-200', title: 'Требует осторожности' },
  impossible: { chip: 'bg-red-100 text-red-800 border-red-200', title: 'Решения нет' },
};

/** Почему получился такой статус — словами, без сокращений. */
function statusReason(e: Evaluation, m: number, status: SearchStatus): string {
  const badAxles = e.wagonReports.reduce((n, r) => n + r.axles.filter((a) => a.status !== 'ok').length, 0);
  const badBogies = e.nextChecks.filter((n) => !n.ok).length;

  if (badAxles > 0) {
    return `Оси вне секций или в зазоре: ${badAxles}. Геометрию платформы менять нужно.`;
  }
  if (badBogies > 0) {
    return `Передняя тележка сцепленного вагона попадает на платформу: ${badBogies} случаев. Соседний вагон заедет на весы.`;
  }
  if (status === 'ok') {
    return `Все оси на секциях, тележки соседей не задеты, запас не меньше ${mmUnit(m)}.`;
  }
  if (status === 'caution') {
    const d = e.minCurrentMargin;
    return Number.isFinite(d)
      ? `Геометрия в норме, но минимальный запас ${mmUnit(d)} меньше требуемых ${mmUnit(m)} — не хватает ${mmUnit(e.deficit)}.`
      : 'Геометрия в норме, но запаса посчитать не удалось: ни одна ося не встала на секцию.';
  }
  return 'Ни одна конфигурация не удовлетворяет ограничениям.';
}

/** Короткая причина для строки альтернативы. */
function altReason(e: Evaluation, m: number): string {
  const badAxles = e.wagonReports.reduce((n, r) => n + r.axles.filter((a) => a.status !== 'ok').length, 0);
  const badBogies = e.nextChecks.filter((n) => !n.ok).length;
  const parts: string[] = [];
  if (badAxles > 0) parts.push(`осей вне секций: ${badAxles}`);
  if (badBogies > 0) parts.push(`тележка на секции: ${badBogies}`);
  if (parts.length === 0 && Number.isFinite(e.minCurrentMargin) && e.minCurrentMargin < m) {
    parts.push(`запас ${mmUnit(e.minCurrentMargin)} < ${mmUnit(m)}`);
  }
  return parts.join(' · ') || '—';
}

/* ────────────────────────────────────────────────────────────
   Панель
   ──────────────────────────────────────────────────────────── */

const ResultPanel: React.FC<Props> = ({
  result,
  margin,
  selectedWagonId,
  onSelectWagon,
  nextWagonId,
  onSelectNextWagon,
  onSelectAlternative,
  onDownloadPng,
}) => {
  const { best, evaluation, alternatives, perfect, status, evaluated, capped, message } = result;
  const st = STATUS[status];
  const hasSolution = best.lengths.length > 0;

  const pairs = useMemo(() => pairRows(evaluation), [evaluation]);
  const badPairs = pairs.filter((p) => !p.ok).length;

  if (!hasSolution) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Результат</h2>
          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${st.chip}`}>{st.title}</span>
        </div>
        <p className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
          {message ?? 'Подходящая конфигурация не найдена.'}
        </p>
        <p className="text-xs text-gray-400">
          Проверено вариантов: {evaluated.toLocaleString('ru-RU')}
          {capped ? ' — поиск остановлен по лимиту' : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Статус и управление схемой */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-800">Результат</h2>
        <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${st.chip}`}>{st.title}</span>
      </div>
      <p className="text-xs text-gray-600">{statusReason(evaluation, margin, status)}</p>
      {message && <p className="text-xs text-amber-700">{message}</p>}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {evaluation.wagonReports.length > 0 && (
          <>
            <label className="flex items-center gap-1">
              <span className="text-gray-400">На платформе</span>
              <select
                className="rounded border border-gray-300 px-1.5 py-0.5 focus:border-teal-500 focus:outline-none"
                value={selectedWagonId}
                onChange={(e) => onSelectWagon(e.target.value)}
              >
                {evaluation.wagonReports.map((r) => (
                  <option key={r.wagon.id} value={r.wagon.id}>
                    {r.wagon.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-400">Сцеплён</span>
              <select
                className="rounded border border-gray-300 px-1.5 py-0.5 focus:border-teal-500 focus:outline-none"
                value={nextWagonId}
                onChange={(e) => onSelectNextWagon(e.target.value)}
              >
                {evaluation.wagonReports.map((r) => (
                  <option key={r.wagon.id} value={r.wagon.id}>
                    {r.wagon.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          onClick={onDownloadPng}
          className="ml-auto rounded bg-gray-100 px-2 py-0.5 text-gray-700 hover:bg-gray-200"
        >
          Скачать PNG
        </button>
      </div>

      {/* Выбранная конфигурация */}
      <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-xs text-gray-400">Секции </span>
            <b>{best.lengths.map((l) => mm(l)).join(' + ')}</b>
          </span>
          <span>
            <span className="text-xs text-gray-400">Зазор между секциями </span>
            <b>{best.gaps.length ? best.gaps.map((g) => mm(g)).join(' + ') : '—'}</b>
          </span>
          <span>
            <span className="text-xs text-gray-400">Длина платформы </span>
            <b>{mmUnit(best.total)}</b>
          </span>
        </div>
      </div>

      {/* Единственная таблица: комбинации вагонов */}
      {pairs.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-400">
              <th className="py-1 pl-2 pr-2 font-normal">
                Комбинация
                <span className="ml-1.5 font-normal">
                  перебрано пар: {pairs.length}
                  {badPairs > 0 ? `, с нарушением: ${badPairs}` : ', все годны'}
                </span>
              </th>
              <th className="py-1 pr-2 text-right font-normal">Зазор</th>
              <th className="py-1 pr-2 text-right font-normal">Оценка</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const ok = p.ok && p.clearance >= margin;
              return (
                <tr
                  key={p.pair}
                  className={`border-b border-gray-100 last:border-0 ${p.ok ? '' : 'bg-red-50'}`}
                  title={`${p.side === 'left' ? 'слева' : 'справа'}, ось ${mm(p.axleX)} мм`}
                >
                  <td className="py-1 pl-2 pr-2 text-gray-700">{p.pair}</td>
                  <td className="py-1 pr-2 text-right">
                    <b className={ok ? 'text-green-700' : 'text-red-600'}>{mmUnit(p.clearance)}</b>
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {!p.ok ? (
                      <span className="text-red-600">на секции {p.onSections.join(', ') || '—'}</span>
                    ) : ok ? (
                      <span className="text-green-700">не задет</span>
                    ) : (
                      <span className="text-red-600">мал</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Альтернативы */}
      {alternatives.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-gray-700">
            Другие варианты
            <span className="ml-1.5 font-normal text-gray-400">выберите, чтобы посмотреть на схеме</span>
          </h3>
          <div className="space-y-1">
            {alternatives.slice(0, 5).map((alt, i) => {
              const ok = alt.evaluation.ok;
              return (
                <button
                  key={i}
                  onClick={() => onSelectAlternative(i)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1 text-left text-xs hover:border-teal-400"
                >
                  <span className="text-gray-700">
                    {alt.candidate.lengths.map((l) => mm(l)).join(' + ')}
                    <span className="text-gray-400">
                      {' / '}
                      {alt.candidate.gaps.length ? alt.candidate.gaps.map((g) => mm(g)).join(' + ') : '—'}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right ${ok ? 'text-green-700' : 'text-gray-500'}`}>
                    {ok ? 'выполнено' : altReason(alt.evaluation, margin)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Проверено вариантов: {evaluated.toLocaleString('ru-RU')}
        {capped ? ' — поиск остановлен по лимиту' : ''}
        {!perfect && status !== 'ok' ? ' · показаны варианты с наименьшим числом нарушений' : ''}
      </p>
    </div>
  );
};

export default ResultPanel;
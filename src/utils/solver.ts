import { evaluate, totalPlatformLength } from './geometry';
import type { Evaluation, Candidate, SearchResult, SearchStatus, WagonType, SearchParams } from './types';

/** Предохранитель на случай pathologically широких диапазонов. */
const MAX_EVAL = 300_000;
/** Сколько лучших вариантов держим для показа пользователю. */
const TOP_KEEP = 10;

/* ────────────────────────────────────────
   Генератор диапазонов значений
   ──────────────────────────────────────── */

function genRange(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) return [];
  // Шаг ≤ 0 приводил бы к бесконечному циклу, а min > max — к пустому диапазону
  if (step <= 0 || max < min) return [];
  const vals: number[] = [];
  for (let v = min; v <= max; v += step) {
    vals.push(Math.round(v));
    // Защита от накопления ошибки float при дробном шаге
    if (vals.length > MAX_EVAL) break;
  }
  return vals;
}

/* ────────────────────────────────────────
   Основной поиск
   ──────────────────────────────────────── */

export function search(
  wagons: WagonType[],
  params: SearchParams
): SearchResult {
  if (wagons.length === 0) {
    return emptyResult(0, 'Отметьте хотя бы один тип вагона.');
  }

  const {
    sectionCount: N,
    equalSections,
    sectionMin, sectionMax, sectionStep,
    gapMin, gapMax, gapStep,
    margin,
    marginFloor,
    totalMax,
  } = params;

  const Lvals = genRange(sectionMin, sectionMax, sectionStep);
  const Gvals = N > 1 ? genRange(gapMin, gapMax, gapStep) : [0];

  if (Lvals.length === 0) {
    return emptyResult(
      0,
      `Диапазон длин секций пуст: нужно «от» ≤ «до» (сейчас ${sectionMin}…${sectionMax} мм) и шаг > 0 (${sectionStep} мм).`
    );
  }
  if (N > 1 && Gvals.length === 0) {
    return emptyResult(
      0,
      `Диапазон зазоров пуст: нужно «от» ≤ «до» (сейчас ${gapMin}…${gapMax} мм) и шаг > 0 (${gapStep} мм).`
    );
  }

  let evaluated = 0;
  let capped = false;

  // Есть ли конфигурация, где ни одна ося не стоит вне секций и ни одна
  // тележка соседа не задета — независимо от запаса.
  const geometryFeasible = (e: Evaluation) => e.currentFailures === 0 && e.nextFailures === 0;
  // Более мягкое условие «best-effort»: допускаем нехватку запаса,
  // но не ниже явно заданного пользователем порога marginFloor.
  const acceptable = (e: Evaluation) =>
    geometryFeasible(e) && Number.isFinite(e.minCurrentMargin) &&
    e.minCurrentMargin >= Math.min(marginFloor, margin);

  const top: { candidate: Candidate; evaluation: Evaluation }[] = [];
  const seen = new Set<string>();

  const pushTop = (lengths: number[], gaps: number[]) => {
    const total = totalPlatformLength(lengths, gaps);
    if (total > totalMax) return;
    const key = `${lengths.join(',')}:${gaps.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    top.push({ candidate: { lengths, gaps, total }, evaluation: evaluate(lengths, gaps, wagons, margin) });
    top.sort(sorter);
    if (top.length > TOP_KEEP) top.length = TOP_KEEP;
  };

  if (N === 1) {
    for (const L of Lvals) {
      if (evaluated++ >= MAX_EVAL) { capped = true; break; }
      pushTop([L], []);
    }
  } else if (equalSections) {
    // Симметричная платформа: все секции равны, все зазоры равны
    for (const L of Lvals) {
      for (const G of Gvals) {
        if (evaluated++ >= MAX_EVAL) { capped = true; break; }
        pushTop(Array(N).fill(L), Array(N - 1).fill(G));
      }
      if (capped) break;
    }
  } else if (N === 2) {
    // Две секции могут быть разной длины; зазор всего один
    for (const L1 of Lvals) {
      for (const L2 of Lvals) {
        for (const G of Gvals) {
          if (evaluated++ >= MAX_EVAL) { capped = true; break; }
          pushTop([L1, L2], [G]);
        }
        if (capped) break;
      }
      if (capped) break;
    }
  } else {
    // N = 3: симметрия L1 = L3 и G1 = G2 оставляет 3 переменные
    for (const L1 of Lvals) {
      for (const L2 of Lvals) {
        for (const G of Gvals) {
          if (evaluated++ >= MAX_EVAL) { capped = true; break; }
          pushTop([L1, L2, L1], [G, G]);
        }
        if (capped) break;
      }
      if (capped) break;
    }
  }

  const best = top[0]?.candidate ?? null;
  if (!best) {
    return emptyResult(
      evaluated,
      `Ни одна конфигурация не уложилась в ограничение полной длины ${totalMax} мм. Уменьшите максимальную длину платформы или длины секций.`,
      capped
    );
  }

  const bestEval = top[0].evaluation;
  const perfect = bestEval.ok;

  return {
    best,
    evaluation: bestEval,
    alternatives: top.slice(1),
    perfect,
    status: statusOf(bestEval, acceptable(bestEval)),
    evaluated,
    capped,
  };
}

/* ────────────────────────────────────────
   Утилиты
   ──────────────────────────────────────── */

/**
 * Итоговый статус по оценке кандидата.
 * `isAcceptable` — прошло ли кандидат смягчённое условие по marginFloor.
 */
export function statusOf(e: Evaluation, isAcceptable: boolean): SearchStatus {
  if (e.ok) return 'ok';
  if (e.currentFailures === 0 && e.nextFailures === 0) return 'caution';
  return isAcceptable ? 'caution' : 'impossible';
}

/**
 * Порядок предпочтения: сначала решение, проходящее все нормативы, затем
 * геометрически корректное с нехваткой запаса, затем всё остальное.
 * Внутри класса — меньше нарушений, больше запас, короче платформа.
 */
function sorter(a: { candidate: Candidate; evaluation: Evaluation }, b: { candidate: Candidate; evaluation: Evaluation }): number {
  if (a.evaluation.ok !== b.evaluation.ok) return a.evaluation.ok ? -1 : 1;

  const geoA = a.evaluation.currentFailures === 0 && a.evaluation.nextFailures === 0;
  const geoB = b.evaluation.currentFailures === 0 && b.evaluation.nextFailures === 0;
  if (geoA !== geoB) return geoA ? -1 : 1;

  if (a.evaluation.currentFailures !== b.evaluation.currentFailures) return a.evaluation.currentFailures - b.evaluation.currentFailures;
  if (a.evaluation.nextFailures !== b.evaluation.nextFailures) return a.evaluation.nextFailures - b.evaluation.nextFailures;

  // Чем больше запас — тем лучше (по убыванию); −Infinity уходит в конец
  const ma = a.evaluation.minCurrentMargin;
  const mb = b.evaluation.minCurrentMargin;
  if (ma !== mb) return mb - ma;

  return a.candidate.total - b.candidate.total;
}

function emptyResult(evaluated: number, message?: string, capped = false): SearchResult {
  return {
    best: { lengths: [], gaps: [], total: 0 },
    evaluation: {
      lengths: [], gaps: [], sections: [], total: 0, center: 0,
      wagonReports: [], nextChecks: [],
      currentFailures: 0, nextFailures: 0,
      minCurrentMargin: -Infinity, marginOk: false, deficit: 0, ok: false,
    },
    alternatives: [],
    perfect: false,
    status: 'impossible',
    evaluated,
    capped,
    message,
  };
}

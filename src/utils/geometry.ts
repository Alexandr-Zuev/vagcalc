import type { WagonType, Section, AxleCheck, AxleStatus, WagonReport, NextWagonCheck, Evaluation } from './types';

/* ────────────────────────────────────────
   Геометрия вагона
   ──────────────────────────────────────── */

/**
 * Позиции 4 осей относительно центра вагона.
 * ±(B + b) / 2 — внешние колёса каждой тележки,
 * ±(B − b) / 2 — внутренние колёса.
 */
export function axleOffsets(wagon: WagonType): number[] {
  const B = wagon.baseMm;
  const b = wagon.bogieMm;
  return [-(B + b) / 2, -(B - b) / 2, (B - b) / 2, (B + b) / 2];
}

/** Абсолютные позиции осей при центрировании на платформе с центром `cx`. */
export function axlePositions(wagon: WagonType, cx: number): number[] {
  return axleOffsets(wagon).map((o) => cx + o);
}

/* ────────────────────────────────────────
   Геометрия платформы
   ──────────────────────────────────────── */

export function buildSections(lengths: number[], gaps: number[]): Section[] {
  const sections: Section[] = [];
  let pos = 0;
  for (let i = 0; i < lengths.length; i++) {
    sections.push({ index: i, start: pos, end: pos + lengths[i] });
    pos += lengths[i];
    if (i < gaps.length) pos += gaps[i];
  }
  return sections;
}

export function totalPlatformLength(lengths: number[], gaps: number[]): number {
  return lengths.reduce((s, l) => s + l, 0) + gaps.reduce((s, g) => s + g, 0);
}

/** Проверяет, попадает ли координата X внутрь секции [start, end]. */
function isOnSection(x: number, section: Section): boolean {
  return x >= section.start && x <= section.end;
}

/* ────────────────────────────────────────
   Проверка текущего вагона
   ──────────────────────────────────────── */

/**
 * Для каждой оси:
 *  - если на секции → margin = min(отступ до обеих кромок секции), статус 'ok'.
 *  - если в зазоре (между секциями, но внутри платформы) → статус 'in-gap', margin = −∞.
 *  - если за пределами платформы → статус 'out', margin = −∞.
 *
 * Пустой набор секций трактуется как «все оси вне платформы».
 */
export function checkCurrentWagon(
  wagon: WagonType,
  cx: number,
  sections: Section[],
  marginRequired: number
): WagonReport {
  const positions = axlePositions(wagon, cx);
  const axles: AxleCheck[] = [];
  const firstSec = sections[0];
  const lastSec = sections[sections.length - 1];

  for (const x of positions) {
    let status: AxleStatus = 'out';
    let sectionIndex: number | null = null;
    let margin = -Infinity;

    for (const sec of sections) {
      if (isOnSection(x, sec)) {
        status = 'ok';
        sectionIndex = sec.index;
        margin = Math.min(x - sec.start, sec.end - x);
        break;
      }
    }

    // Проверяем, не в зазоре ли (между секциями, но внутри платформы)
    if (status !== 'ok' && firstSec && lastSec) {
      if (x > firstSec.start - marginRequired && x < lastSec.end + marginRequired) {
        status = 'in-gap';
      }
    }

    axles.push({ x, status, sectionIndex, margin });
  }

  // Наименьший запас среди осей на секциях
  const onSectionMargins = axles.filter((a) => a.status === 'ok').map((a) => a.margin);
  const minMargin = onSectionMargins.length > 0
    ? Math.min(...onSectionMargins)
    : -Infinity;

  // Вагон проходит, только если ВСЕ оси на секциях И запас ≥ 0
  const allOnSection = axles.every((a) => a.status === 'ok');
  const ok = allOnSection && minMargin >= 0;
  const problems: string[] = [];

  for (const a of axles) {
    if (a.status === 'in-gap') {
      problems.push(`Ось X=${Math.round(a.x)} мм — в зазоре`);
    } else if (a.status === 'out') {
      problems.push(`Ось X=${Math.round(a.x)} мм — вне платформы`);
    } else if (a.status === 'ok' && a.margin < 0) {
      problems.push(`Ось X=${Math.round(a.x)} мм — запас ${Math.round(a.margin)} мм < 0`);
    }
  }

  return { wagon, center: cx, axles, minMargin, ok, problems };
}

/* ────────────────────────────────────────
   Проверка следующего вагона
   ──────────────────────────────────────── */

/**
 * Следующий вагон сцеплен с текущим.
 * Сторона 'right': c_next = c + C_cur/2 + C_next/2.
 * Сторона 'left':  c_next = c − C_cur/2 − C_next/2.
 * Проверяется только ПЕРЕДНЯЯ тележка (ближняя к платформе): у неё ровно две
 * оси, расположенные симметрично относительно её центра — b_ось = b/2.
 * Нарушение: хотя бы одна ось передней тележки стоит на секции.
 */
export function checkNextWagon(
  curWagon: WagonType,
  nextWagon: WagonType,
  cx: number,
  sections: Section[],
  side: 'left' | 'right'
): NextWagonCheck {
  const C_cur = curWagon.couplerMm;
  const C_next = nextWagon.couplerMm;
  const B_next = nextWagon.baseMm;
  const b_next = nextWagon.bogieMm;

  const halfCoupler = (C_cur + C_next) / 2;
  const c_next = side === 'right' ? cx + halfCoupler : cx - halfCoupler;

  // Передняя тележка (ближе к платформе)
  const bogieCenter = side === 'right'
    ? c_next - B_next / 2
    : c_next + B_next / 2;

  // Только две оси тележки, а не четыре оси всего вагона
  const axles = [bogieCenter - b_next / 2, bogieCenter + b_next / 2].sort((a, b) => a - b);

  const results = axles.map((x) => {
    let onSectionIndex: number | null = null;
    for (const sec of sections) {
      if (isOnSection(x, sec)) {
        onSectionIndex = sec.index;
        break;
      }
    }
    return { x, onSectionIndex };
  });

  const ok = !results.some((r) => r.onSectionIndex !== null);

  // Clearance = расстояние от оси до ближайшей кромки ближайшей секции (отрицательный если на секции)
  let minClearance = Infinity;
  for (const r of results) {
    let closest = Infinity;
    for (const sec of sections) {
      if (r.x < sec.start) closest = Math.min(closest, sec.start - r.x);
      else if (r.x > sec.end) closest = Math.min(closest, r.x - sec.end);
      else closest = Math.min(closest, 0); // на секции
    }
    minClearance = Math.min(minClearance, closest);
  }
  if (minClearance === Infinity) minClearance = -Infinity;

  return {
    currentName: curWagon.name,
    nextName: nextWagon.name,
    side,
    axles: results,
    ok,
    minClearance,
  };
}

/* ────────────────────────────────────────
   Полная оценка кандидата
   ──────────────────────────────────────── */

export function evaluate(
  lengths: number[],
  gaps: number[],
  wagons: WagonType[],
  marginRequired: number
): Evaluation {
  const sections = buildSections(lengths, gaps);
  const total = totalPlatformLength(lengths, gaps);
  const cx = total / 2;

  const wagonReports: WagonReport[] = [];
  let currentFailures = 0;
  let minCurrentMargin = Infinity;

  for (const w of wagons) {
    const report = checkCurrentWagon(w, cx, sections, marginRequired);
    wagonReports.push(report);
    if (!report.ok) currentFailures += report.axles.filter((a) => a.status !== 'ok').length;
    const onSectionM = report.axles.filter((a) => a.status === 'ok').map((a) => a.margin);
    if (onSectionM.length > 0) minCurrentMargin = Math.min(minCurrentMargin, Math.min(...onSectionM));
  }

  if (minCurrentMargin === Infinity) minCurrentMargin = -Infinity;

  const nextChecks: NextWagonCheck[] = [];
  let nextFailures = 0;

  for (const w of wagons) {
    for (const n of wagons) {
      for (const side of ['left' as const, 'right' as const]) {
        const nc = checkNextWagon(w, n, cx, sections, side);
        nextChecks.push(nc);
        if (!nc.ok) nextFailures++;
      }
    }
  }

  // −Infinity, если ни одна ось ни одного вагона не встала на секцию:
  // дефицит в этом случае не определён, а не бесконечен
  const deficit = Number.isFinite(minCurrentMargin)
    ? Math.max(0, marginRequired - minCurrentMargin)
    : 0;

  // Нормативы выполнены: все оси на секциях, тележки соседей не задеты
  // И требуемый запас m выдержан — иначе решение лишь «с оговоркой».
  const marginOk = minCurrentMargin >= marginRequired;
  const ok = currentFailures === 0 && nextFailures === 0 && marginOk;

  return {
    lengths,
    gaps,
    sections,
    total,
    center: cx,
    wagonReports,
    nextChecks,
    currentFailures,
    nextFailures,
    minCurrentMargin,
    marginOk,
    deficit,
    ok,
  };
}

import React, { useId, useMemo } from 'react';
import type { Evaluation, WagonType } from '../utils/types';
import { axleOffsets } from '../utils/geometry';
import { mm } from '../utils/format';

interface Props {
  evaluation: Evaluation;
  /** Вагон, который рисуется на платформе */
  wagon: WagonType;
  /** Следующий (сцепленный) вагон, чья тележка проверяется */
  nextWagon: WagonType;
  margin: number;
  width?: number;
}

/* ────────────────────────────────────────────────────────────
   Палитра и шрифты чертежа
   ──────────────────────────────────────────────────────────── */
const INK = '#1f2937'; // основная линия
const LINE = '#4b5563'; // вспомогательная
const THIN = '#9ca3af'; // призрачная линия
const TEAL = '#0f766e'; // вагон
const BLUE = '#1d4ed8'; // платформа
const RED = '#b91c1c'; // нарушение
const AMBER = '#b45309'; // запретная зона
const GREEN = '#047857'; // норма
const VIOLET = '#6d28d9'; // тележка сцепленного вагона
const GRID_A = '#e6f1fb';
const GRID_B = '#cfe1f4';

const FS = "'PT Sans Narrow','Arial Narrow',Arial,sans-serif";
const DIM_FS = "'Georgia','Times New Roman',serif";

/* Расшифровка условных обозначений для блока под схемой.
   Цвет символа совпадает с цветом соответствующей размерной линии. */
const LEGEND: { s: string; d: string; c: string }[] = [
  { s: 'B', d: 'база вагона — расстояние между центрами тележек', c: TEAL },
  { s: 'C', d: 'длина вагона по осям сцепок', c: INK },
  { s: 'b', d: 'колёсная база тележки — расстояние между осями внутри тележки', c: TEAL },
  { s: 'm', d: 'минимально допустимый отступ оси колеса от кромки секции', c: GREEN },
  { s: 'L', d: 'габарит платформы — полная длина от первой до последней кромки', c: INK },
];

/* Высоты платформы кратны миллиметрам, а длина платформы — десятки метров.
   Чтобы чертёж читался, высоты условно завышают (приём продольного профиля). */
const S = 1.6;

/* C — длина по осям сцепок, поэтому кузов всегда короче C: торцы кузова
   отступают от плоскостей сцепок на вылет автосцепки. */
const OVERHANG = 400;

/** Колесо в профиле: бандаж, гребень, ступица, спицы, осевой знак. */
function Wheel({ cx, cy, r, bad, ghost }: { cx: number; cy: number; r: number; bad?: boolean; ghost?: boolean }) {
  const stroke = bad ? RED : ghost ? THIN : TEAL;
  return (
    <g opacity={ghost ? 0.5 : 1}>
      <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke={stroke} strokeWidth={1.9} />
      <circle cx={cx} cy={cy} r={r * 0.84} fill="none" stroke={stroke} strokeWidth={0.7} strokeDasharray="3 2" opacity={0.85} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={cx + Math.cos(a) * r * 0.34}
            y1={cy + Math.sin(a) * r * 0.34}
            x2={cx + Math.cos(a) * r * 0.8}
            y2={cy + Math.sin(a) * r * 0.8}
            stroke={stroke}
            strokeWidth={0.7}
            opacity={0.7}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.34} fill="#ffffff" stroke={stroke} strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={Math.max(1, r * 0.1)} fill={stroke} stroke="none" />
      <line x1={cx - r * 1.4} y1={cy} x2={cx + r * 1.4} y2={cy} stroke={stroke} strokeWidth={0.6} strokeDasharray="10 3 1.5 3" opacity={0.75} />
      <line x1={cx} y1={cy - r * 1.4} x2={cx} y2={cy + r * 1.4} stroke={stroke} strokeWidth={0.6} strokeDasharray="10 3 1.5 3" opacity={0.75} />
    </g>
  );
}

/** Тележка: боковая рама, буксы, рессоры, надрессорная балка. */
function Bogie({ ax1, ax2, cy, sY, sX, ghost, bad }: { ax1: number; ax2: number; cy: number; sY: number; sX: number; ghost?: boolean; bad?: boolean }) {
  const stroke = bad ? RED : ghost ? THIN : TEAL;
  const pad = Math.max(6, 380 * sX);
  const top = cy - 250 * sY; // верх боковой рамы ≈ 710 мм над рельсом
  const bot = cy + 90 * sY;
  const mid = (ax1 + ax2) / 2;
  const hw = Math.max(8, 300 * sX);

  const spring = (sx: number) => {
    const y0 = top + 5;
    const y1 = cy + 20 * sY;
    let d = `M ${sx} ${y0}`;
    for (let i = 1; i <= 5; i++) d += ` L ${sx + (i % 2 ? 4 : -4)} ${y0 + ((y1 - y0) * i) / 5}`;
    return d;
  };

  return (
    <g opacity={ghost ? 0.5 : 1}>
      <path
        d={`M ${ax1 - pad} ${bot} L ${ax1 - pad} ${top + 7} Q ${ax1 - pad} ${top} ${ax1 - pad + 7} ${top}
            L ${ax2 + pad - 7} ${top} Q ${ax2 + pad} ${top} ${ax2 + pad} ${top + 7} L ${ax2 + pad} ${bot}
            L ${ax2 + pad - 9} ${bot} L ${ax2 + pad - 9} ${top + 12} L ${ax1 - pad + 9} ${top + 12} L ${ax1 - pad + 9} ${bot} Z`}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={1.5}
      />
      <rect x={mid - hw} y={top - 11} width={hw * 2} height={11} fill="#ffffff" stroke={stroke} strokeWidth={1.2} />
      <path d={spring(ax1 + pad * 0.4)} fill="none" stroke={stroke} strokeWidth={1} />
      <path d={spring(ax2 - pad * 0.4)} fill="none" stroke={stroke} strokeWidth={1} />
      <rect x={ax1 - 6} y={cy - 9} width={12} height={18} fill="#ffffff" stroke={stroke} strokeWidth={1.2} />
      <rect x={ax2 - 6} y={cy - 9} width={12} height={18} fill="#ffffff" stroke={stroke} strokeWidth={1.2} />
      <line x1={ax1} y1={cy} x2={ax2} y2={cy} stroke={stroke} strokeWidth={0.8} strokeDasharray="12 3 2 3" opacity={0.65} />
    </g>
  );
}

/* Габарит автосцепки на чертеже, px: хвостовик + вылет коронки. Плоскость
   сцепки — внешний торец коронки, именно по ней отмеряется C. */
const CPL_SHANK = 26;
const CPL_HOOK = 11;
const CPL = CPL_SHANK + CPL_HOOK;

/**
 * Автосцепка: хвостовик и коронка, условно.
 * `x` — плоскость сцепки (внешний торец коронки). Рама доходит до этой
 * плоскости, поэтому хвостовик ложится на её торец, а коронка выходит наружу
 * ровно до `x` — тогда торец рамы и грань габарита совпадают.
 */
function Coupler({ x, y, dir, sY }: { x: number; y: number; dir: 1 | -1; sY: number }) {
  const h = Math.max(7, 190 * sY);
  // Начало хвостовика и точка выхода коронки внутрь вагона
  const x0 = dir === 1 ? x - CPL : x + CPL_HOOK;
  const hookX = dir === 1 ? x - CPL_HOOK : x + CPL_HOOK;
  return (
    <g stroke={TEAL} fill="#ffffff" strokeWidth={1.2}>
      <rect x={x0} y={y - h / 2} width={CPL_SHANK} height={h} />
      <path d={`M ${hookX} ${y - h * 0.85} q ${dir * -CPL_HOOK} ${h * 0.15} ${dir * -CPL_HOOK} ${h * 0.85} q 0 ${h * 0.7} ${dir * CPL_HOOK} ${h * 0.85}`} fill="none" />
    </g>
  );
}

/** Символ разрыва — обрывок габарита за пределами листа. */
function BreakMark({ x, y, h }: { x: number; y: number; h: number }) {
  return (
    <path
      d={`M ${x - 4} ${y - h / 2} L ${x + 4} ${y - h / 3} L ${x - 4} ${y} L ${x + 4} ${y + h / 3} L ${x - 4} ${y + h / 2}`}
      fill="none"
      stroke={THIN}
      strokeWidth={1.2}
    />
  );
}

/** Выноска наименования: линия к точке на кузове, полка, имя и подпись под ним. */
function Callout({
  x, y, sx, sy, dir, text, sub, color = INK,
}: {
  x: number; y: number; sx: number; sy: number; dir: 1 | -1; text: string; sub?: string; color?: string;
}) {
  const w = Math.max(54, text.length * 6.6, (sub?.length ?? 0) * 5.2);
  return (
    <g>
      <polyline points={`${x},${y} ${sx},${sy}`} fill="none" stroke={color} strokeWidth={0.8} />
      <line x1={sx} y1={sy} x2={sx + dir * w} y2={sy} stroke={color} strokeWidth={0.8} />
      <circle cx={x} cy={y} r={1.8} fill={color} />
      <text x={sx + dir * 5} y={sy - 5} fontSize={11.5} fontWeight={600} fontFamily={FS} fill={color} textAnchor={dir === 1 ? 'start' : 'end'}>
        {text}
      </text>
      {sub && (
        <text x={sx + dir * 5} y={sy - 17} fontSize={8.5} fontFamily={FS} fill={LINE} textAnchor={dir === 1 ? 'start' : 'end'}>
          {sub}
        </text>
      )}
    </g>
  );
}

/* ────────────────────────────────────────────────────────────
   Размерные и вспомогательные линии
   ──────────────────────────────────────────────────────────── */

/** Линейный размер со стрелками и выносными штрихами. */
function Dim({
  x1,
  x2,
  y,
  label,
  color = INK,
  above = true,
  fs = 12,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  color?: string;
  above?: boolean;
  fs?: number;
}) {
  if (!Number.isFinite(x1) || !Number.isFinite(x2) || Math.abs(x2 - x1) < 1) return null;
  const a = Math.min(x1, x2);
  const b = Math.max(x1, x2);
  const tip = Math.min(7, (b - a) / 2);
  const half = 2.3;
  const textY = above ? y - 4 : y + 12;
  return (
    <g stroke={color} fill={color}>
      <line x1={a} y1={y} x2={b} y2={y} strokeWidth={0.9} />
      <polygon points={`${a},${y} ${a + tip},${y - half} ${a + tip},${y + half}`} stroke="none" />
      <polygon points={`${b},${y} ${b - tip},${y - half} ${b - tip},${y + half}`} stroke="none" />
      <line x1={a} y1={y - 4} x2={a} y2={y + 4} strokeWidth={0.9} />
      <line x1={b} y1={y - 4} x2={b} y2={y + 4} strokeWidth={0.9} />
      <text x={(a + b) / 2} y={textY} fontSize={fs} fontStyle="italic" fontFamily={DIM_FS} textAnchor="middle" stroke="none">
        {label}
      </text>
    </g>
  );
}

/** Выносная линия. */
function Ext({ x, y1, y2, color = INK, dashed }: { x: number; y1: number; y2: number; color?: string; dashed?: boolean }) {
  return <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={0.75} strokeDasharray={dashed ? '4 3' : undefined} />;
}

const SchemeDiagram: React.FC<Props> = ({ evaluation, wagon, nextWagon, margin, width = 1100 }) => {
  const { sections, center: cx, wagonReports, nextChecks } = evaluation;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const m = useMemo(() => {
    const WHEEL_R = 460;
    const RAIL_H = 172;
    const DECK_H = 420;
    const FOUND_H = 130;
    const BODY_H = 2600;
    const BODY_FLOOR = 1150; // пол вагона над головкой рельса
    const FRAME_H = 270;
    const ROOF = BODY_FLOOR + BODY_H;

    const axles = axleOffsets(wagon).map((o) => cx + o);
    const report = wagonReports.find((r) => r.wagon.id === wagon.id);

    // Передняя тележка сцепленного вагона (ближняя к платформе)
    const halfCoupler = (wagon.couplerMm + nextWagon.couplerMm) / 2;
    const ghost = (dir: 1 | -1) => {
      const cNext = cx + dir * halfCoupler;
      const bogieCenter = cNext - dir * (nextWagon.baseMm / 2);
      return {
        cNext,
        bogieCenter,
        bogieAxles: [bogieCenter - nextWagon.bogieMm / 2, bogieCenter + nextWagon.bogieMm / 2] as [number, number],
      };
    };
    const gl = ghost(-1);
    const gr = ghost(1);

    const nextRight = nextChecks.find((n) => n.side === 'right' && n.currentName === wagon.name && n.nextName === nextWagon.name);
    const nextLeft = nextChecks.find((n) => n.side === 'left' && n.currentName === wagon.name && n.nextName === nextWagon.name);

    const secEndW = sections.length ? sections[sections.length - 1].end : 0;
    const worldMin = Math.min(0, cx - wagon.couplerMm / 2, gl.bogieAxles[0] - 760) - 420;
    const worldMax = Math.max(secEndW, cx + wagon.couplerMm / 2, gr.bogieAxles[1] + 760) + 420;

    const padX = 64;
    const avail = width - 2 * padX;
    const sX = Math.min(avail / (worldMax - worldMin), 0.075);
    const offX = padX + Math.max(0, (avail - (worldMax - worldMin) * sX) / 2);
    const sY = sX * S;
    const X = (v: number) => offX + (v - worldMin) * sX;

    /* Вертикальная компоновка листа */
      const topBand = 140;
 // выноски + размерные цепи C / B / b
    const bodyTop = 18 + topBand;
    const railHeadY = bodyTop + ROOF * sY;
    const wheelCy = railHeadY - WHEEL_R * sY;
    const frameBot = railHeadY - (BODY_FLOOR - FRAME_H) * sY;
    const frameTop = railHeadY - BODY_FLOOR * sY;
    const bodyBot = frameTop;
    const deckBot = railHeadY + DECK_H * sY;
    const foundBot = deckBot + FOUND_H * sY;

    const dimY1 = foundBot + 26; // вылет от крайней оси до конца платформы
    const dimY2 = dimY1 + 26; // ширины секций + зазоры между ними
    const dimY3 = dimY2 + 30; // общий габарит L
    // Пояса запаса m вынесены под всю размерную цепочку: полоса платформы
    // слишком тонка (вертикаль сжата в S раз), а на уровне колёс текст
    // наливался на ось, бандаж и штриховку балласта.
    // В левом поясе — размеры от левой кромки секции, в правом — от правой,
    // иначе размеры соседних секций перекрываются.
    const mRow1 = dimY3 + 26;
    const mRow2 = mRow1 + 24;
    const noteY = mRow2 + 34;
    // Рамка SVG: y=16..height-16. Легенда занимает noteY + 17 + (n-1)*14,
    // нужен запас ~12px ниже последнего символа.
    const height = noteY + 16 + 17 + (LEGEND.length - 1) * 14 + 12;

    return {
      WHEEL_R, RAIL_H, DECK_H, FOUND_H, axles, report, gl, gr,
      nextRight, nextLeft, worldMin, worldMax, sX, sY, X, railHeadY, wheelCy,
      frameBot, frameTop, bodyBot, bodyTop, deckBot, foundBot,
      dimY1, dimY2, dimY3, mRow1, mRow2, noteY, height,
    };
  }, [evaluation, wagon, nextWagon, cx, sections, wagonReports, nextChecks, width]);

  const {
    WHEEL_R, RAIL_H, DECK_H, FOUND_H, axles, report, gl, gr,
    nextRight, nextLeft, worldMin, worldMax, sX, sY, X, railHeadY, wheelCy,
    frameBot, frameTop, bodyBot, bodyTop, deckBot, foundBot,
    dimY1, dimY2, dimY3, mRow1, mRow2, noteY, height,
  } = m;

  // Плоскости сцепок — внешние торцы коронок автосцепок, по ним отмеряется C
  const couplerLeft = X(cx - wagon.couplerMm / 2);
  const couplerRight = X(cx + wagon.couplerMm / 2);
  // Рама идёт до плоскостей сцепок — её торец и есть грань габарита по длине
  const frameLeft = couplerLeft;
  const frameRight = couplerRight;
  // Ось автосцепки — на ней отмечается плоскость сцепки
  const couplerY = (frameTop + frameBot) / 2;
  // Кузов короче рамы на вылет концевой балки с каждой стороны
  const bodyLeft = frameLeft + OVERHANG * sX;
  const bodyRight = frameRight - OVERHANG * sX;
  const bogieCenters = [cx - wagon.baseMm / 2, cx + wagon.baseMm / 2];
  const firstAxleX = axles[0];
  const lastAxleX = axles[axles.length - 1];
  const secStart = sections[0]?.start ?? 0;
  const secEnd = sections[sections.length - 1]?.end ?? 0;

  const axleBad = (x: number) => {
    const a = report?.axles.find((v) => Math.abs(v.x - x) < 0.5);
    return !a || a.status !== 'ok' || a.margin < 0;
  };

  /** Ось стоит на секции (а не в зазоре между секциями) */
  const axlesOnDeck = (x: number) => sections.some((s) => x >= s.start && x <= s.end);

  /** Внутренняя граница рамки листа — до неё дорисовывается сцепленный вагон. */
  const INNER = 26;

  /**
   * Геометрия сцепленного вагона. Кузов и рама дорисовываются до внутренней
   * границы рамки, а линия разрыва ставится внутри листа — так за разрывом
   * видно кусок вагона, уходящего за пределы чертежа.
   */
  const ghostBox = (g: typeof gl, dir: 1 | -1) => {
    const border = dir === -1 ? INNER : width - INNER;
    // Плоскости сцепок соседа. Рама соседа, как и у расставляемого вагона,
    // доходит до своей плоскости сцепки, а кузов отступает от рамы на вылет
    // концевой балки — между кузовами виден зазор, который стягивают сцепки.
    const nearCoupler = X(g.cNext - dir * (nextWagon.couplerMm / 2));
    const xNear = nearCoupler + dir * OVERHANG * sX;
    const farCoupler = X(g.cNext + dir * (nextWagon.couplerMm / 2));
    const farReal = farCoupler - dir * OVERHANG * sX;
    const xFar = dir === -1 ? Math.max(farReal, border) : Math.min(farReal, border);
    const cut = dir === -1 ? farReal < border : farReal > border;
    // Рама идёт до плоскостей сцепок
    const f0 = Math.min(nearCoupler, xFar) - 5;
    const f1 = Math.max(nearCoupler, xFar) + 5;
    return { border, xNear, xFar, x0: Math.min(xNear, xFar), x1: Math.max(xNear, xFar), f0, f1, cut };
  };

  /** Ширина плашки выноски — нужна, чтобы не вынести подпись за рамку. */
  const calloutW = (text: string, sub?: string) =>
    Math.max(54, text.length * 6.6, (sub?.length ?? 0) * 5.2);

  const pat = (n: string) => `p${uid}-${n}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" className="max-w-full h-auto">
      <defs>
        <pattern id={pat('grid')} width="25" height="25" patternUnits="userSpaceOnUse">
          <rect width="25" height="25" fill="#fbfdff" />
          <path d="M5 0V25 M10 0V25 M15 0V25 M20 0V25 M0 5H25 M0 10H25 M0 15H25 M0 20H25" stroke={GRID_A} strokeWidth="0.6" />
          <path d="M0 0H25 M0 0V25" stroke={GRID_B} strokeWidth="0.9" />
        </pattern>
        <pattern id={pat('conc')} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke={BLUE} strokeWidth="0.7" opacity="0.5" />
          <circle cx="4.5" cy="4.5" r="0.5" fill={BLUE} opacity="0.45" />
        </pattern>
        <pattern id={pat('forbid')} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={AMBER} strokeWidth="1.1" opacity="0.7" />
        </pattern>
        <pattern id={pat('danger')} width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 0L7 7M7 0L0 7" stroke={RED} strokeWidth="0.9" opacity="0.7" />
        </pattern>
        <pattern id={pat('ballast')} width="11" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4h5M7 1h4M2 7h5" stroke="#78716c" strokeWidth="0.7" opacity="0.6" />
        </pattern>
        <pattern id={pat('bogie')} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={VIOLET} strokeWidth="1" opacity="0.45" />
        </pattern>
      </defs>

      {/* Лист, миллиметровка, рамка */}
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      <rect x={18} y={18} width={width - 36} height={height - 36} fill={`url(#${pat('grid')})`} />
      <rect x={18} y={18} width={width - 36} height={height - 36} fill="none" stroke={INK} strokeWidth={2.2} />
      <rect x={24} y={24} width={width - 48} height={height - 48} fill="none" stroke={INK} strokeWidth={0.6} opacity={0.5} />

      {/* Балласт, шпалы, рельсовая линия */}
      <rect x={X(worldMin) + 8} y={railHeadY} width={Math.max(0, X(worldMax) - X(worldMin) - 16)} height={RAIL_H * sY} fill={`url(#${pat('ballast')})`} opacity={0.55} />
      <rect x={X(worldMin) + 8} y={railHeadY + RAIL_H * sY} width={Math.max(0, X(worldMax) - X(worldMin) - 16)} height={Math.max(0, foundBot - railHeadY - RAIL_H * sY)} fill={`url(#${pat('ballast')})`} opacity={0.4} />
      {sections.slice(0, -1).map((s, i) => {
        const a = X(s.end);
        const b = X(sections[i + 1].start);
        const n = Math.max(2, Math.round((b - a) / 9));
        return Array.from({ length: n }).map((_, k) => <rect key={`sl${i}-${k}`} x={a + ((b - a) * (k + 0.5)) / n - 3} y={railHeadY} width={6} height={RAIL_H * sY} fill="#57534e" opacity={0.85} />);
      })}
      <line x1={X(worldMin) + 8} y1={railHeadY} x2={X(worldMax) - 8} y2={railHeadY} stroke={INK} strokeWidth={2} />

      {/* Секции платформы */}
      {sections.map((s) => {
        const x = X(s.start);
        const w = (s.end - s.start) * sX;
        const bw = Math.min(w / 2, margin * sX);
        return (
          <g key={s.index}>
            <rect x={x} y={railHeadY} width={w} height={DECK_H * sY} fill={`url(#${pat('conc')})`} stroke={BLUE} strokeWidth={1.8} />
            <line x1={x} y1={railHeadY} x2={x + w} y2={railHeadY} stroke={BLUE} strokeWidth={2.8} />
            <rect x={x + 7} y={deckBot} width={Math.max(0, w - 14)} height={FOUND_H * sY} fill="none" stroke={LINE} strokeWidth={1} strokeDasharray="5 3" />
            {margin > 0 && (
              <>
                <rect x={x} y={railHeadY} width={bw} height={DECK_H * sY} fill={`url(#${pat('forbid')})`} />
                <rect x={x + w - bw} y={railHeadY} width={bw} height={DECK_H * sY} fill={`url(#${pat('forbid')})`} />
              </>
            )}
            <text x={x + w / 2} y={railHeadY + 14} fontSize={9} fontFamily={FS} fill={BLUE} textAnchor="middle">
              секция {s.index + 1}
            </text>
          </g>
        );
      })}

      {/* Граница «не заезжать» и зона передней тележки сцепленного вагона */}
      {([['left', gl, nextLeft, secStart], ['right', gr, nextRight, secEnd]] as const).map(([side, g, chk, lim], i) => {
        const dir = side === 'right' ? 1 : -1;
        const near = side === 'right' ? Math.min(...g.bogieAxles) : Math.max(...g.bogieAxles);
        const x0 = X(Math.min(lim, near));
        const x1 = X(Math.max(lim, near));
        const violated = chk ? !chk.ok : false;
        return (
          <g key={`gz${i}`}>
            <line x1={X(lim)} y1={railHeadY - 1300 * sY} x2={X(lim)} y2={foundBot} stroke={VIOLET} strokeWidth={0.9} strokeDasharray="9 3 2 3" />
            <path d={`M ${X(lim)} ${railHeadY - 1300 * sY} l ${dir * -11} -5 v 10 z`} fill={VIOLET} stroke="none" />
            {violated && <rect x={x0} y={railHeadY - 4} width={Math.max(0, x1 - x0)} height={DECK_H * sY + 4} fill={`url(#${pat('bogie')})`} stroke={VIOLET} strokeWidth={0.9} strokeDasharray="5 3" />}
          </g>
        );
      })}

      {/* Оси в зазоре / вне платформы */}
      {report?.axles
        .filter((a) => a.status !== 'ok')
        .map((a, i) => {
          const x = X(a.x);
          return (
            <g key={`bad${i}`}>
              <rect x={x - 9} y={railHeadY} width={18} height={DECK_H * sY} fill={`url(#${pat('danger')})`} stroke={RED} strokeWidth={1} strokeDasharray="4 3" />
              <Ext x={x} y1={wheelCy} y2={foundBot + 8} color={RED} dashed />
              <circle cx={x} cy={wheelCy} r={WHEEL_R * sY + 4} fill="none" stroke={RED} strokeWidth={1.4} strokeDasharray="4 3" />
            </g>
          );
        })}

      {/* Сцепленные вагоны: штриховой кузов дорисован до рамки листа,
          линия разрыва стоит внутри листа — за ней виден кусок вагона. */}
      {([gl, gr] as const).map((g, i) => {
        const dir = i === 0 ? -1 : 1;
        const ok = i === 0 ? nextLeft?.ok !== false : nextRight?.ok !== false;
        const stroke = ok ? THIN : VIOLET;
        const b = ghostBox(g, dir);
        const w = Math.max(0, b.x1 - b.x0);
        const farCenter = g.cNext + dir * (nextWagon.baseMm / 2);
        const farA = X(farCenter - nextWagon.bogieMm / 2);
        const farB = X(farCenter + nextWagon.bogieMm / 2);
        const farShown = b.cut && farA > INNER + 6 && farB < width - INNER - 6;
        const ribs = Math.max(0, Math.floor(w / 46) - 1);
        return (
          <g key={`gw${i}`} opacity={0.6}>
            <rect x={b.x0} y={bodyTop} width={w} height={bodyBot - bodyTop} fill="none" stroke={stroke} strokeWidth={1.1} strokeDasharray="7 4" />
            <rect x={b.f0} y={frameTop} width={Math.max(0, b.f1 - b.f0)} height={Math.max(2, frameBot - frameTop)} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="7 4" />
            {Array.from({ length: ribs }).map((_, k) => {
              const x = b.x0 + (w * (k + 1)) / (ribs + 1);
              return <line key={`grib${i}-${k}`} x1={x} y1={bodyTop + 2} x2={x} y2={bodyBot - 2} stroke={stroke} strokeWidth={0.5} strokeDasharray="5 4" opacity={0.5} />;
            })}
            <Bogie ax1={X(g.bogieAxles[0])} ax2={X(g.bogieAxles[1])} cy={wheelCy} sY={sY} sX={sX} ghost bad={!ok} />
            <Wheel cx={X(g.bogieAxles[0])} cy={wheelCy} r={WHEEL_R * sY} ghost bad={!ok} />
            <Wheel cx={X(g.bogieAxles[1])} cy={wheelCy} r={WHEEL_R * sY} ghost bad={!ok} />
            {farShown && (
              <>
                <Bogie ax1={farA} ax2={farB} cy={wheelCy} sY={sY} sX={sX} ghost bad={!ok} />
                <Wheel cx={farA} cy={wheelCy} r={WHEEL_R * sY} ghost bad={!ok} />
                <Wheel cx={farB} cy={wheelCy} r={WHEEL_R * sY} ghost bad={!ok} />
              </>
            )}
            {b.cut && (
              <BreakMark
                x={dir === -1 ? Math.min(b.border + 46, b.xNear - 30) : Math.max(b.border - 46, b.xNear + 30)}
                y={(bodyTop + bodyBot) / 2}
                h={Math.max(28, (bodyBot - bodyTop) * 0.5)}
              />
            )}
          </g>
        );
      })}

      {/* Кузов */}
      <rect x={bodyLeft} y={bodyTop} width={bodyRight - bodyLeft} height={bodyBot - bodyTop} fill="#ffffff" stroke={TEAL} strokeWidth={2.2} />
      <rect x={bodyLeft + 3} y={bodyTop + 3} width={Math.max(0, bodyRight - bodyLeft - 6)} height={Math.max(0, bodyBot - bodyTop - 6)} fill="none" stroke={TEAL} strokeWidth={0.6} opacity={0.45} />
      {Array.from({ length: 9 }).map((_, i) => {
        const x = bodyLeft + ((bodyRight - bodyLeft) * (i + 1)) / 10;
        return <line key={`rib${i}`} x1={x} y1={bodyTop + 2} x2={x} y2={bodyBot - 2} stroke={TEAL} strokeWidth={0.5} opacity={0.3} />;
      })}
      <rect x={(bodyLeft + bodyRight) / 2 - 13} y={bodyTop + 8} width={26} height={Math.max(0, bodyBot - bodyTop - 10)} fill="none" stroke={TEAL} strokeWidth={0.9} opacity={0.55} />
      <line x1={(bodyLeft + bodyRight) / 2} y1={bodyTop + 8} x2={(bodyLeft + bodyRight) / 2} y2={bodyBot - 2} stroke={TEAL} strokeWidth={0.7} opacity={0.55} />

      {/* Рама и автосцепки */}
      <rect x={frameLeft} y={frameTop} width={frameRight - frameLeft} height={Math.max(2, frameBot - frameTop)} fill="#ffffff" stroke={TEAL} strokeWidth={1.7} />
      <line x1={frameLeft} y1={(frameTop + frameBot) / 2} x2={frameRight} y2={(frameTop + frameBot) / 2} stroke={TEAL} strokeWidth={0.6} opacity={0.45} />
      <Coupler x={couplerLeft} y={(frameTop + frameBot) / 2 + 3} dir={-1} sY={sY} />
      <Coupler x={couplerRight} y={(frameTop + frameBot) / 2 + 3} dir={1} sY={sY} />

      {/* Тележки и колёса текущего вагона */}
      {bogieCenters.map((c, i) => (
        <Bogie key={`bg${i}`} ax1={X(c - wagon.bogieMm / 2)} ax2={X(c + wagon.bogieMm / 2)} cy={wheelCy} sY={sY} sX={sX} />
      ))}
      {axles.map((x, i) => (
        <Wheel key={i} cx={X(x)} cy={wheelCy} r={WHEEL_R * sY} bad={axleBad(x)} />
      ))}

      {/* Центровые линии */}
      <line x1={X(cx)} y1={bodyTop - 56} x2={X(cx)} y2={foundBot + 12} stroke={INK} strokeWidth={0.8} strokeDasharray="18 4 2 4" opacity={0.65} />
      {bogieCenters.map((c, i) => (
        <line key={`cl${i}`} x1={X(c)} y1={frameTop - 34} x2={X(c)} y2={railHeadY + 8} stroke={INK} strokeWidth={0.7} strokeDasharray="11 3 2 3" opacity={0.45} />
      ))}

      {/* Верхние размеры вагона: C, B, b */}
      {/* Габарит вагона по длине — от плоскости сцепки до плоскости сцепки.
          Границы габарита показаны сквозными штрихпунктирными плоскостями на всю
          высоту кузова: без них торцы рам обоих сцепленных вагонов (они упираются
          в одну плоскость) неотличимы от границы габарита, и C читается
          как размер кузова или рамы. Засечка на оси автосцепки показывает,
          где именно лежит плоскость сцепки. */}
      {[couplerLeft, couplerRight].map((x, i) => (
        <g key={`cpl${i}`}>
          <line x1={x} y1={bodyTop - 8} x2={x} y2={foundBot} stroke={LINE} strokeWidth={1} strokeDasharray="16 4 3 4" opacity={0.9} />
          <line x1={x} y1={couplerY - 15} x2={x} y2={couplerY + 15} stroke={INK} strokeWidth={1.7} />
          <path d={`M ${x} ${couplerY - 15} l -5 -9 M ${x} ${couplerY - 15} l 5 -9`} fill="none" stroke={INK} strokeWidth={1.3} />
          <circle cx={x} cy={couplerY} r={2.1} fill={INK} />
          <Ext x={x} y1={bodyTop - 8} y2={bodyTop - 80} />
        </g>
      ))}
      <Dim x1={couplerLeft} x2={couplerRight} y={bodyTop - 76} label={`C = ${mm(wagon.couplerMm)}`} />
      <text
        x={(couplerLeft + couplerRight) / 2}
        y={bodyTop - 61}
        fontSize={9}
        fontStyle="italic"
        fontFamily={DIM_FS}
        fill={LINE}
        textAnchor="middle"
      >
        по осям сцепок
      </text>
      {bogieCenters.map((c, i) => (
        <Ext key={`be${i}`} x={X(c)} y1={frameTop - 2} y2={bodyTop - 52} dashed />
      ))}
      <Dim x1={X(bogieCenters[0])} x2={X(bogieCenters[1])} y={bodyTop - 48} label={`B = ${mm(wagon.baseMm)}`} color={TEAL} fs={11} />
      <Ext x={X(bogieCenters[1] - wagon.bogieMm / 2)} y1={frameTop - 2} y2={bodyTop - 26} dashed />
      <Ext x={X(bogieCenters[1] + wagon.bogieMm / 2)} y1={frameTop - 2} y2={bodyTop - 26} dashed />
      <Dim x1={X(bogieCenters[1] - wagon.bogieMm / 2)} x2={X(bogieCenters[1] + wagon.bogieMm / 2)} y={bodyTop - 22} label={`b = ${mm(wagon.bogieMm)}`} color={TEAL} fs={10} />

      {/* Нижняя размерная цепочка */}
      <Ext x={X(firstAxleX)} y1={wheelCy + WHEEL_R * sY} y2={dimY1} />
      <Ext x={X(lastAxleX)} y1={wheelCy + WHEEL_R * sY} y2={dimY1} />
      {sections.map((s) => (
        <React.Fragment key={`ext${s.index}`}>
          <Ext x={X(s.start)} y1={foundBot} y2={dimY3} />
          <Ext x={X(s.end)} y1={foundBot} y2={dimY3} />
        </React.Fragment>
      ))}
      <Dim x1={X(firstAxleX)} x2={X(secStart)} y={dimY1} label={mm(secStart - firstAxleX)} color={TEAL} fs={11} />
      <Dim x1={X(lastAxleX)} x2={X(secEnd)} y={dimY1} label={mm(secEnd - lastAxleX)} color={TEAL} fs={11} />
      {sections.map((s, i) => (
        <Dim key={`dim${i}`} x1={X(s.start)} x2={X(s.end)} y={dimY2} label={mm(s.end - s.start)} />
      ))}
      {sections.slice(0, -1).map((s, i) => (
        <Dim key={`gdim${i}`} x1={X(s.end)} x2={X(sections[i + 1].start)} y={dimY2} label={mm(sections[i + 1].start - s.end)} color={AMBER} fs={11} />
      ))}
      {sections.length > 0 && <Dim x1={X(secStart)} x2={X(secEnd)} y={dimY3} label={`L = ${mm(secEnd - secStart)} — габарит платформы`} />}

      {/* Отметки осей колёс на поверхности платформы: треугольник на боковой
          грани секции в плане оси + размер от кромки до ближайшей оси.
          Это и есть фактический запас m у каждой кромки. */}
      {axles.map((x, i) => {
        const inDeck = axlesOnDeck(x);
        const mx = X(x);
        const my = railHeadY + 2;
        return <path key={`amk${i}`} d={`M ${mx - 5.5} ${my} L ${mx + 5.5} ${my} L ${mx} ${my + 10} Z`} fill={inDeck ? TEAL : RED} opacity={0.95} />;
      })}
      {/* короткие проекции всех осей под платформу */}
      {axles.map((x, i) => (
        <line key={`apx${i}`} x1={X(x)} y1={railHeadY + 12} x2={X(x)} y2={foundBot} stroke={LINE} strokeWidth={0.6} strokeDasharray="3 2" opacity={0.5} />
      ))}
      {/* Запас m от каждой кромки секции до ближайшей оси.
          Подписи вынесены в два пояса под всю размерную цепочку, потому что
          сама полоса платформы в вертикальном масштабе сливается с колёсами. */}
      {sections.map((s, si) => {
        const onSec = axles.filter((x) => x >= s.start - 0.5 && x <= s.end + 0.5);
        if (onSec.length === 0) return null;
        const nearLeft = onSec[0];
        const nearRight = onSec[onSec.length - 1];
        const okL = nearLeft - s.start >= margin;
        const okR = s.end - nearRight >= margin;
        return (
          <React.Fragment key={`edge${si}`}>
            {/* colored leader only below the dim chain, to keep that zone clean */}
            <line x1={X(nearLeft)} y1={dimY3} x2={X(nearLeft)} y2={mRow1} stroke={okL ? GREEN : RED} strokeWidth={0.7} />
            <line x1={X(nearRight)} y1={dimY3} x2={X(nearRight)} y2={mRow2} stroke={okR ? GREEN : RED} strokeWidth={0.7} />
            <Dim x1={X(s.start)} x2={X(nearLeft)} y={mRow1} label={`m = ${mm(nearLeft - s.start)}`} color={okL ? GREEN : RED} fs={10} />
            <Dim x1={X(nearRight)} x2={X(s.end)} y={mRow2} label={`m = ${mm(s.end - nearRight)}`} color={okR ? GREEN : RED} fs={10} />
          </React.Fragment>
        );
      })}

      {/* Зазор до тележки сцепленного вагона */}
      {/* Зазор отложен от БЛИЖНЕЙ оси передней тележки соседа: именно она
          первая въезжает на платформу, и geometry.ts считает clearance по ней.
          От дальней оси размер был бы завышен ровно на b. */}
      {nextRight && nextRight.ok && <Dim x1={X(Math.min(...gr.bogieAxles))} x2={X(secEnd)} y={railHeadY + 16} label={`зазор ${mm(nextRight.minClearance)}`} color={VIOLET} above={false} fs={10} />}
      {nextLeft && nextLeft.ok && <Dim x1={X(secStart)} x2={X(Math.max(...gl.bogieAxles))} y={railHeadY + 16} label={`зазор ${mm(nextLeft.minClearance)}`} color={VIOLET} above={false} fs={10} />}

      {/* Наименования вагонов */}
      <Callout
        x={X(cx) - (bodyRight - bodyLeft) * 0.28}
        y={bodyTop}
        sx={X(cx) - (bodyRight - bodyLeft) * 0.28}
        sy={bodyTop - 104}
        dir={-1}
        text={wagon.name}
        sub="вагон на платформе"
      />
      {(() => {
        const bl = ghostBox(gl, -1);
        const br = ghostBox(gr, 1);
        const w = calloutW(nextWagon.name, 'сцепленный вагон');
        const axL = (bl.xNear + bl.x0) / 2;
        const axR = (br.xNear + br.x1) / 2;
        return (
          <>
            <Callout x={axL} y={bodyTop} sx={Math.max(axL, INNER + w + 8)} sy={bodyTop - 26} dir={-1} text={nextWagon.name} sub="сцепленный вагон" />
            <Callout x={axR} y={bodyTop} sx={Math.min(axR, width - INNER - w - 8)} sy={bodyTop - 26} dir={1} text={nextWagon.name} sub="сцепленный вагон" />
          </>
        );
      })()}

      {/* Условные обозначения */}
      <text x={46} y={noteY} fontFamily={FS} fontSize={9} fontWeight={700} letterSpacing={0.8} fill={LINE}>
        УСЛОВНЫЕ ОБОЗНАЧЕНИЯ
      </text>
      {LEGEND.map((r, i) => (
        <text key={r.s} y={noteY + 17 + i * 14} fontFamily={FS} fontSize={9.5} fill={LINE}>
          <tspan x={46} fontFamily={DIM_FS} fontStyle="italic" fontSize={11.5} fontWeight={700} fill={r.c}>
            {r.s}
          </tspan>
          <tspan x={64}>— {r.d}</tspan>
        </text>
      ))}
    </svg>
  );
};

export default SchemeDiagram;

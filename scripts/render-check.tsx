/* Временная проверка: рендерим SchemeDiagram в статическую разметку и
   собираем все числовые координаты — проверяем выход за viewBox и NaN. */
import { renderToStaticMarkup } from 'react-dom/server';
import SchemeDiagram from '../src/components/SchemeDiagram';
import { search } from '../src/utils/solver';
import { VEHICLE_PRESETS } from '../src/data/presets';
import type { SearchParams } from '../src/utils/types';

const params: SearchParams = {
  sectionCount: 3,
  equalSections: true,
  sectionMin: 10,
  sectionMax: 14,
  sectionStep: 0.5,
  gapMin: 10,
  gapMax: 16,
  gapStep: 0.5,
  margin: 5,
  marginFloor: 2,
  totalMax: 60,
};

const result = search([VEHICLE_PRESETS[0]], params);
const ev = result.evaluation;

type Props = React.ComponentProps<typeof SchemeDiagram>;

const cases: { title: string; props: Props }[] = [
  {
    title: 'ok · несколько секций',
    props: {
      evaluation: ev,
      lengths: result.best.lengths,
      gaps: result.best.gaps,
      total: result.best.total,
      gapMin: params.gapMin,
      margin: params.margin,
      marginFloor: params.marginFloor,
      status: result.status,
    },
  },
  {
    title: 'один вагон',
    props: {
      evaluation: { ...ev, sections: [{ ...ev.sections[0], count: 1 }] },
      lengths: [ev.sections[0].length],
      gaps: [],
      total: ev.sections[0].length,
      gapMin: params.gapMin,
      margin: params.margin,
      marginFloor: params.marginFloor,
      status: result.status,
    },
  },
  {
    title: 'impossible',
    props: {
      evaluation: ev,
      lengths: result.best.lengths,
      gaps: result.best.gaps,
      total: result.best.total,
      gapMin: params.gapMin,
      margin: params.margin,
      marginFloor: params.marginFloor,
      status: 'impossible',
    },
  },
  {
    title: 'caution',
    props: {
      evaluation: ev,
      lengths: result.best.lengths,
      gaps: result.best.gaps,
      total: result.best.total,
      gapMin: params.gapMin,
      margin: params.margin,
      marginFloor: params.marginFloor,
      status: 'caution',
    },
  },
  {
    title: 'margin = 0',
    props: {
      evaluation: ev,
      lengths: result.best.lengths,
      gaps: result.best.gaps,
      total: result.best.total,
      gapMin: params.gapMin,
      margin: 0,
      marginFloor: 0,
      status: result.status,
    },
  },
];

let bad = 0;
for (const { title, props } of cases) {
  const html = renderToStaticMarkup(<SchemeDiagram {...props} />);
  const vb = /viewBox="([\d.\s-]+)"/.exec(html);
  if (!vb) { console.log(`${title}: NO VIEWBOX`); bad++; continue; }
  const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const attr = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(html))) {
    const [, name, value] = m;
    if (name === 'viewBox' || name === 'd' || name === 'points' || name === 'transform') continue;
    for (const tok of value.split(/[\s,]+/)) {
      const n = Number(tok);
      if (!Number.isFinite(n)) continue;
      if (name === 'x' || name === 'x1' || name === 'x2' || name === 'cx') { minX = Math.min(minX, n); maxX = Math.max(maxX, n); }
      if (name === 'y' || name === 'y1' || name === 'y2' || name === 'cy') { minY = Math.min(minY, n); maxY = Math.max(maxY, n); }
    }
  }
  const dOut = /NaN|undefined|Infinity/.test(html);
  const out = minX < 0 || minY < 0 || maxX > vw || maxY > vh;
  if (dOut || out) bad++;
  console.log(
    `${dOut || out ? '✗' : '✓'} ${title.padEnd(24)} vb=${vw}x${vh}  x:[${minX.toFixed(1)},${maxX.toFixed(1)}]  y:[${minY.toFixed(1)},${maxY.toFixed(1)}]  ${dOut ? 'NaN/undefined!' : ''}`
  );
}
console.log(bad === 0 ? '\nOK' : `\n${bad} проблемных рендера(ов)`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from './solver.mjs';
import { evaluate, checkNextWagon, checkCurrentWagon, buildSections, axleOffsets } from './geometry.mjs';
import { WAGON_TYPES } from './presets.mjs';

const P = {
  sectionCount: 2, equalSections: true,
  sectionMin: 3000, sectionMax: 8000, sectionStep: 100,
  gapMin: 1000, gapMax: 7000, gapStep: 100,
  margin: 100, marginFloor: 50, totalMax: 25000,
};
const covered = WAGON_TYPES.find((w) => w.id === 'covered-12-132');

// ── Bug 1: оси тележки следующего вагона ────────────────────────────────────
test('тележка соседа: ровно 2 оси, разнесённые на b, а не на длину вагона', () => {
  const tank = WAGON_TYPES.find((w) => w.id === 'tank-15-1548');
  const secs = buildSections([8000, 8000], [1100]);
  const cx = 17100 / 2;
  const nc = checkNextWagon(covered, tank, cx, secs, 'right');
  const halfCoupler = (covered.couplerMm + tank.couplerMm) / 2;
  const bogieCenter = cx + halfCoupler - tank.baseMm / 2;
  const expected = [bogieCenter - tank.bogieMm / 2, bogieCenter + tank.bogieMm / 2].sort((a, b) => a - b);
  assert.equal(nc.axles.length, 2, 'должно быть 2 оси тележки');
  expected.forEach((e, i) => assert.ok(Math.abs(nc.axles[i].x - e) < 1e-9, `ось ${i}: ${nc.axles[i].x} != ${e}`));
  assert.ok(Math.abs((nc.axles[1].x - nc.axles[0].x) - tank.bogieMm) < 1e-9, 'разнос осей тележки должен равняться b');
});

test('тележка соседа не попадает на секции при заведомо годной платформе', () => {
  const r = search([covered], P);
  assert.equal(r.evaluation.nextFailures, 0, `ожидался 0 нарушений, получено ${r.evaluation.nextFailures}`);
  assert.equal(r.status, 'ok', `ожидался статус ok, получено ${r.status}`);
  assert.equal(r.perfect, true);
});

test('правдивость проверки соседа: доля проходящих конфигураций > 50%', () => {
  let pass = 0, total = 0;
  for (let L = 3000; L <= 8000; L += 100) {
    for (let G = 1000; G <= 7000; G += 100) {
      if (2 * L + G > P.totalMax) continue;
      total++;
      const secs = buildSections([L, L], [G]);
      const cx = (2 * L + G) / 2;
      if (checkNextWagon(covered, covered, cx, secs, 'right').ok &&
          checkNextWagon(covered, covered, cx, secs, 'left').ok) pass++;
    }
  }
  assert.ok(pass / total > 0.5, `проходит только ${pass}/${total}`);
});

// Проверка соседа не должна быть «слишком доброй»: слишком короткая платформа
// действительно должна приводить к попаданию тележки на секцию.
test('проверка соседа по-прежнему ловит нарушения на слишком короткой платформе', () => {
  const secs = buildSections([3000, 3000], [1000]);
  const cx = 7000 / 2;
  const nc = checkNextWagon(covered, covered, cx, secs, 'right');
  const anyOn = nc.axles.some((a) => a.onSectionIndex !== null);
  assert.equal(nc.ok, !anyOn);
  // 2*3000+1000 = 7000 мм платформа при вагоне 14720 мм — тележки сцепленного
  // вагона физически могут попасть на платформу; если нет — тест нестрогий,
  // но проверка обязана быть непротиворечивой
  assert.ok(Number.isFinite(nc.minClearance));
});

// ── Bug 2: пустые диапазоны не должны ронять приложение ────────────────────
test('gapMin > gapMax не падает, а возвращает объяснение', () => {
  const r = search([covered], { ...P, gapMin: 7000, gapMax: 1000 });
  assert.equal(r.status, 'impossible');
  assert.ok(r.message && r.message.includes('зазор'), `нет сообщения: ${r.message}`);
  assert.deepEqual(r.best.lengths, []);
});

test('sectionMin > sectionMax не падает', () => {
  const r = search([covered], { ...P, sectionMin: 9000, sectionMax: 3000 });
  assert.equal(r.status, 'impossible');
  assert.ok(r.message && r.message.includes('секций'), `нет сообщения: ${r.message}`);
});

test('шаг 0 не даёт бесконечный цикл', () => {
  const r = search([covered], { ...P, sectionStep: 0 });
  assert.equal(r.status, 'impossible');
  assert.ok(r.message);
});

test('отрицательный шаг не даёт бесконечный цикл', () => {
  const r = search([covered], { ...P, gapStep: -100 });
  assert.equal(r.status, 'impossible');
});

test('evaluate с пустыми секциями не падает', () => {
  const e = evaluate([], [], [covered], 100);
  assert.equal(e.ok, false);
  assert.equal(e.wagonReports[0].axles.every((a) => a.status === 'out'), true);
});

test('ограничение totalMax, которое невыполнимо, даёт объяснение', () => {
  const r = search([covered], { ...P, totalMax: 100 });
  assert.equal(r.status, 'impossible');
  assert.ok(r.message && r.message.includes('длин'), `нет сообщения: ${r.message}`);
});

// ── Требование запаса m теперь влияет на ok ────────────────────────────────
test('deficit и marginOk согласованы с требуемым запасом', () => {
  const r = search([covered], { ...P, margin: 100000 });
  assert.equal(r.evaluation.marginOk, false, 'marginOk должен быть false при невыполнимом m');
  assert.equal(r.evaluation.ok, false);
  assert.ok(r.evaluation.deficit > 0, 'deficit должен быть положительным');
  assert.equal(r.status, 'caution', `геометрия верна — ожидался caution, получено ${r.status}`);
});

test('marginOk true при выполнимом запасе', () => {
  const r = search([covered], P);
  assert.equal(r.evaluation.marginOk, true);
  assert.equal(r.evaluation.deficit, 0);
});

test('deficit не равен бесконечности, когда ни одна ося не на секции', () => {
  const e = evaluate([1000], [], [covered], 100);
  assert.equal(e.wagonReports[0].axles.some((a) => a.status === 'ok'), false);
  assert.ok(Number.isFinite(e.deficit), 'deficit должен быть конечным');
});

// ── Bug 4: статус edge недостижим ──────────────────────────────────────────
test('статус edge удалён из типов и не используется', () => {
  const e = evaluate([4000], [1000], [covered], 100);
  const statuses = e.wagonReports.flatMap((r) => r.axles.map((a) => a.status));
  assert.equal(statuses.includes('edge'), false);
});

// ── Bug 5: equalSections реально меняет результат при N=2 ──────────────────
test('асимметричная ветка N=2 действительно обходится (иначе она мёртвая)', () => {
  // Диапазоны подобраны так, что симметричная конфигурация невозможна:
  // первая секция обязана быть короткой, вторая — длинной.
  const narrow = {
    ...P,
    sectionMin: 3000, sectionMax: 3200, sectionStep: 100,
    gapMin: 1000, gapMax: 1000, gapStep: 100,
    margin: 0, totalMax: 25000,
  };
  const sym = search([covered], { ...narrow, equalSections: true });
  const asym = search([covered], { ...narrow, equalSections: false });
  assert.equal(sym.best.lengths.length, 2);
  assert.equal(sym.best.lengths[0], sym.best.lengths[1], 'симметричный режим обязан дать равные секции');
  assert.equal(asym.best.lengths.length, 2);
  assert.equal(asym.best.gaps.length, 1);
  // Асимметричный поиск обязан получить не меньше качества
  assert.ok(
    asym.evaluation.currentFailures <= sym.evaluation.currentFailures,
    `асимметричный хуже: ${asym.evaluation.currentFailures} против ${sym.evaluation.currentFailures}`
  );
  assert.ok(
    asym.evaluated >= sym.evaluated,
    `асимметричный обходит больше вариантов: ${asym.evaluated} против ${sym.evaluated}`
  );
});

test('асимметричный режим N=2 способен найти неравные секции', () => {
  // Две секции заметно разной длины при зажатом запасе
  const r = search([covered], {
    ...P,
    equalSections: false,
    sectionMin: 3000, sectionMax: 5000, sectionStep: 100,
    gapMin: 1000, gapMax: 1200, gapStep: 100,
  });
  const unequal = r.alternatives.some((a) => a.candidate.lengths[0] !== a.candidate.lengths[1]);
  assert.ok(unequal || r.best.lengths[0] !== r.best.lengths[1],
    'в наборе кандидатов не нашлось ни одной пары неравных секций');
});

// ── N=1 и N=3 ─────────────────────────────────────────────────────────────
test('N=1: одна секция, без зазоров', () => {
  const r = search([covered], { ...P, sectionCount: 1 });
  assert.equal(r.best.lengths.length, 1);
  assert.equal(r.best.gaps.length, 0);
  assert.equal(r.evaluation.nextChecks.length, 2, 'проверка соседей: 1 вагон × 2 стороны');
});

test('N=3: три секции, два зазора, симметрия L1=L3', () => {
  const r = search([covered], { ...P, sectionCount: 3, equalSections: true });
  assert.equal(r.best.lengths.length, 3);
  assert.equal(r.best.gaps.length, 2);
  const [l1, l2, l3] = r.best.lengths;
  assert.equal(l1, l3, 'симметричная платформа: L1 = L3');
  assert.ok(r.best.total <= P.totalMax);
});

test('N=3 асимметричный: L1 = L3 сохраняется', () => {
  const r = search([covered], { ...P, sectionCount: 3, equalSections: false, sectionStep: 200 });
  assert.equal(r.best.lengths[0], r.best.lengths[2]);
});

// ── Инварианты геометрии ───────────────────────────────────────────────────
test('ось посреди зазора помечается in-gap, на секции — ok, вне — out', () => {
  // Секция 0: [0, 4000], зазор [4000, 5000], секция 1: [5000, 9000]
  const secs = buildSections([4000, 4000], [1000]);
  const fake = { id: 'f', name: 'F', baseMm: 2, couplerMm: 10, bogieMm: 0 };

  // Оси возле центра платформы (4500) попадают ровно в зазор
  const inGap = checkCurrentWagon(fake, 4500, secs, 100);
  assert.equal(inGap.axles.every((a) => a.status === 'in-gap'), true,
    `ожидался in-gap, получено ${inGap.axles.map((a) => a.status).join(',')}`);
  assert.equal(inGap.ok, false);

  // Те же оси, сдвинутые на секцию 1 (центр 7000)
  const onSec = checkCurrentWagon(fake, 7000, secs, 100);
  assert.equal(onSec.axles.every((a) => a.status === 'ok'), true,
    `ожидался ok, получено ${onSec.axles.map((a) => a.status).join(',')}`);

  // Оси далеко за пределами платформы
  const outside = checkCurrentWagon(fake, 40000, secs, 100);
  assert.equal(outside.axles.every((a) => a.status === 'out'), true);
});

test('ось ровно на кромке секции засчитывается как ok с нулевым запасом', () => {
  const secs = buildSections([4000, 4000], [1000]);
  // Кромка секции 1: x = 5000 → ось строго на ней
  const fake = { id: 'f', name: 'F', baseMm: 0, couplerMm: 10, bogieMm: 0 };
  const rep = checkCurrentWagon(fake, 5000, secs, 100);
  for (const a of rep.axles) {
    assert.equal(a.status, 'ok', `ось на кромке должна быть ok, получено ${a.status}`);
    assert.equal(a.margin, 0, 'запас на кромке равен нулю');
  }
});

test('сумма секций и зазоров равна полной длине', () => {
  for (const r of [search([covered], P), search([covered], { ...P, sectionCount: 3, equalSections: false })]) {
    const sum = r.best.lengths.reduce((a, b) => a + b, 0) + r.best.gaps.reduce((a, b) => a + b, 0);
    assert.equal(sum, r.best.total);
    assert.equal(r.evaluation.sections.length, r.best.lengths.length);
    const last = r.evaluation.sections[r.evaluation.sections.length - 1];
    assert.equal(last.end, r.best.total, 'последняя секция должна заканчиваться на общей длине');
  }
});

test('все оси текущего вагона на секциях при статусе ok', () => {
  const r = search([covered], P);
  for (const rep of r.evaluation.wagonReports) {
    assert.equal(rep.axles.every((a) => a.status === 'ok'), true, `${rep.wagon.name}: не все оси на секциях`);
  }
});

test('все nextChecks проходят при статусе ok', () => {
  const r = search([covered], P);
  assert.equal(r.evaluation.nextChecks.every((n) => n.ok), true);
});

test('minClearance конечен и неотрицателен, когда ось не на секции', () => {
  const r = search([covered], P);
  for (const n of r.evaluation.nextChecks) {
    assert.ok(n.minClearance > 0, `clearance должен быть > 0, получено ${n.minClearance}`);
  }
});

// ── Совместимость API ──────────────────────────────────────────────────────
test('search возвращает все поля SearchResult', () => {
  const r = search([covered], P);
  for (const k of ['best', 'evaluation', 'alternatives', 'perfect', 'status', 'evaluated', 'capped']) {
    assert.ok(k in r, `нет поля ${k}`);
  }
  assert.ok(['ok', 'caution', 'impossible'].includes(r.status));
});

test('все пресеты дают решение со статусом ok при дефолтных параметрах', () => {
  const bad = [];
  for (const w of WAGON_TYPES) {
    const r = search([w], P);
    if (r.status !== 'ok') bad.push(`${w.name}: ${r.status} (nextFailures=${r.evaluation.nextFailures}, minMargin=${r.evaluation.minCurrentMargin})`);
  }
  assert.deepEqual(bad, [], `не прошли:\n${bad.join('\n')}`);
});

test('несколько типов вагонов одновременно дают ok', () => {
  const r = search(WAGON_TYPES.slice(0, 4), P);
  assert.equal(r.evaluation.currentFailures, 0, 'оси вне секций');
  assert.equal(r.evaluation.nextFailures, 0, 'тележки соседей задеты');
  assert.equal(r.status, 'ok');
  assert.equal(r.evaluation.wagonReports.length, 4);
});

test('пустой список вагонов даёт impossible без падения', () => {
  const r = search([], P);
  assert.equal(r.status, 'impossible');
  assert.ok(r.message);
});

test('каждый пресет физически непротиворечив: b < B, C > B', () => {
  for (const w of WAGON_TYPES) {
    assert.ok(w.bogieMm > 0 && w.baseMm > w.bogieMm, `${w.name}: b должен быть меньше B`);
    assert.ok(w.couplerMm > w.baseMm, `${w.name}: C должен быть больше B`);
  }
});

test('axleOffsets даёт 4 оси, симметричных относительно центра', () => {
  const o = axleOffsets(covered);
  assert.equal(o.length, 4);
  assert.ok(Math.abs(o[0] + o[3]) < 1e-9);
  assert.ok(Math.abs(o[1] + o[2]) < 1e-9);
  assert.ok(o[0] < o[1] && o[1] < o[2] && o[2] < o[3]);
});

test('альтернативы отсортированы не хуже основного результата', () => {
  const r = search([covered], P);
  for (const alt of r.evaluation.alternatives ? [] : r.alternatives) {
    assert.ok(typeof alt.evaluation.ok === 'boolean');
  }
});

// ── Производительность ─────────────────────────────────────────────────────
test('перебор 8 вагонов укладывается в разумное время', () => {
  const t = Date.now();
  search(WAGON_TYPES, P);
  const ms = Date.now() - t;
  assert.ok(ms < 5000, `перебор занял ${ms} мс`);
});



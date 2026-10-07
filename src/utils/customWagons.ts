import type { WagonType } from './types';

/** Ключ автосохранения в localStorage */
const STORAGE_KEY = 'vagcalc.customWagons.v1';

/** Префикс идентификатора своих вагонов — по нему они отличаются от пресетов */
export const CUSTOM_PREFIX = 'custom-';

export const isCustomWagon = (w: WagonType): boolean => w.id.startsWith(CUSTOM_PREFIX);

/**
 * Физические ограничения, которые проверяет и solver: оси тележки должны
 * помещаться между центрами тележек, а габарит по сцепкам — длиннее базы.
 * Без них `axleOffsets` даст вывернутые внутрь оси.
 */
export function wagonProblems(d: { baseMm: number; couplerMm: number; bogieMm: number }): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(d.baseMm) || d.baseMm <= 0) problems.push('B должно быть больше нуля');
  if (!Number.isFinite(d.couplerMm) || d.couplerMm <= 0) problems.push('C должно быть больше нуля');
  if (!Number.isFinite(d.bogieMm) || d.bogieMm <= 0) problems.push('b должно быть больше нуля');
  if (problems.length > 0) return problems;
  if (d.bogieMm >= d.baseMm) problems.push('b должно быть меньше B');
  if (d.couplerMm <= d.baseMm) problems.push('C должно быть больше B');
  return problems;
}

/* ────────────────────────────────────────────────────────────
   Текстовый формат
   ──────────────────────────────────────────────────────────── */

/**
 * Файл со своими вагонами — простой текст, одна строка на вагон:
 *
 *   Платформа 21-957 | 7800 | 12700 | 1800
 *
 * Порядок полей: название, B (база), C (габарит по сцепкам), b (колёсная база),
 * всё в миллиметрах. Строки с `#` и пустые игнорируются, разделителем может
 * быть `|`, `;` или табуляция — файл остаётся читаемым и правится руками.
 */
export function serializeCustomWagons(wagons: WagonType[]): string {
  const lines = [
    '# Свои вагоны — калькулятор конфигурации весовой платформы',
    '# Формат: название | B, мм | C, мм | b, мм',
    '# Строки, начинающиеся с #, и пустые игнорируются',
    '',
    ...wagons.map((w) => `${w.name} | ${w.baseMm} | ${w.couplerMm} | ${w.bogieMm}`),
  ];
  // BOM — иначе «Блокнот» на Windows откроет кириллицу в неверной кодировке
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export interface ParseResult {
  wagons: WagonType[];
  /** Строки, которые не удалось разобрать или с нарушенными ограничениями */
  skipped: string[];
}

export function parseCustomWagons(text: string): ParseResult {
  const wagons: WagonType[] = [];
  const skipped: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s*[|;\t]\s*/);
    if (parts.length < 4) {
      skipped.push(line);
      continue;
    }
    // Последние три поля — размеры, всё перед ними относится к названию:
    // иначе название с пробелами («Платформа 21-957») не разобрать.
    const nums = parts.slice(-3).map(Number);
    const name = parts.slice(0, -3).join(' ').trim();
    const dims = { baseMm: nums[0], couplerMm: nums[1], bogieMm: nums[2] };
    if (!name || nums.some((v) => !Number.isFinite(v)) || wagonProblems(dims).length > 0) {
      skipped.push(line);
      continue;
    }
    // Идентификатор по имени: повторный импорт того же файла не создаёт дубли
    wagons.push({ id: `${CUSTOM_PREFIX}${slug(name)}`, name, ...dims });
  }

  return { wagons, skipped };
}

/** Транслитерация в безопасный идентификатор; кириллица схлопывается в «v». */
function slug(name: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const s = name
    .toLowerCase()
    .split('')
    .map((ch) => (ch in map ? map[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'wagon';
}

/* ────────────────────────────────────────────────────────────
   Автосохранение в localStorage
   ──────────────────────────────────────────────────────────── */

export function loadCustomWagons(): WagonType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return parseCustomWagons(raw).wagons;
  } catch {
    // приватный режим или запрет хранилища — просто начинаем с пустого списка
    return [];
  }
}

export function saveCustomWagons(wagons: WagonType[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeCustomWagons(wagons));
  } catch {
    /* хранилище недоступно — работаем без автосохранения */
  }
}

/** Скачивание текстового файла с вагонами. */
export function downloadCustomWagons(wagons: WagonType[]): void {
  const blob = new Blob([serializeCustomWagons(wagons)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moy-vagony.txt';
  a.click();
  URL.revokeObjectURL(url);
}
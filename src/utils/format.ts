/** Форматирование размеров: тонкий неразрывный пробел в thousands, как на чертеже. */
export function mm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  const text = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  return `${sign}${text}`;
}

/** То же, но с единицей измерения. */
export function mmUnit(value: number | null | undefined): string {
  const text = mm(value);
  return text === '—' ? text : `${text} мм`;
}

/** Тип вагона: только три геометрических параметра, по которым строится расчёт. */
export interface WagonType {
  id: string;
  name: string;
  /** B — база вагона, расстояние между центрами тележек, мм */
  baseMm: number;
  /** C — длина вагона по осям сцепок, мм */
  couplerMm: number;
  /** b — колёсная база тележки, расстояние между осями внутри тележки, мм */
  bogieMm: number;
}

/** Параметры подбора конфигурации платформы. */
export interface SearchParams {
  /** N — количество секций */
  sectionCount: number;
  /** Подбирать равные длины всех секций и равные зазоры (симметричная платформа) */
  equalSections: boolean;
  sectionMin: number;
  sectionMax: number;
  sectionStep: number;
  gapMin: number;
  gapMax: number;
  gapStep: number;
  /** m — минимально допустимый отступ оси колеса от кромки секции, мм */
  margin: number;
  /** Ниже этого запаса решение не опускается даже в режиме «ближайший вариант», мм */
  marginFloor: number;
  /** Ограничение на полную длину платформы, мм */
  totalMax: number;
}

export interface Section {
  index: number;
  start: number;
  end: number;
}

export type AxleStatus = 'ok' | 'in-gap' | 'out';

export interface AxleCheck {
  x: number;
  status: AxleStatus;
  sectionIndex: number | null;
  /** Запас до ближайшей кромки своей секции; отрицательный — если запас меньше m */
  margin: number;
}

export interface WagonReport {
  wagon: WagonType;
  center: number;
  axles: AxleCheck[];
  /** Наименьший фактический запас среди осей, вставших на секции */
  minMargin: number;
  ok: boolean;
  problems: string[];
}

/** Проверка тележки следующего (сцепленного) вагона. */
export interface NextWagonCheck {
  currentName: string;
  nextName: string;
  side: 'left' | 'right';
  axles: { x: number; onSectionIndex: number | null }[];
  ok: boolean;
  /** Наименьший зазор от оси до ближайшей секции; отрицательный — если ось на секции */
  minClearance: number;
}

export interface Evaluation {
  lengths: number[];
  gaps: number[];
  sections: Section[];
  total: number;
  center: number;
  wagonReports: WagonReport[];
  nextChecks: NextWagonCheck[];
  currentFailures: number;
  nextFailures: number;
  /** Наихудший фактический запас по всем осям всех вагонов; −Infinity, если ни одна ось не на секции */
  minCurrentMargin: number;
  /** Выдержан ли требуемый запас m хотя бы для части осей */
  marginOk: boolean;
  /** Сколько миллиметров не хватило до требуемого запаса m (0 — если всё прошло) */
  deficit: number;
  /** Все оси на секциях, тележки соседей не задеты и запас ≥ m */
  ok: boolean;
}

export interface Candidate {
  lengths: number[];
  gaps: number[];
  total: number;
}

/** Итог подбора: нормативы выполнены / геометрия в норме, но запас меньше m / решения нет. */
export type SearchStatus = 'ok' | 'caution' | 'impossible';

export interface SearchResult {
  /** Найденная конфигурация (идеальная или ближайшая к идеалу) */
  best: Candidate;
  evaluation: Evaluation;
  /** Альтернативные варианты, отсортированные по качеству */
  alternatives: { candidate: Candidate; evaluation: Evaluation }[];
  perfect: boolean;
  status: SearchStatus;
  evaluated: number;
  /** Поиск остановлен по лимиту вычислений */
  capped: boolean;
  /** Пояснение, когда подбор невозможен из-за некорректных границ перебора */
  message?: string;
}

import type { WagonType } from '../utils/types';

/** Пресеты типовых вагонов. Значения приближённые — можно редактировать. */
export const WAGON_TYPES: WagonType[] = [
  {
    id: 'covered-12-132',
    name: 'Крытый 12-132',
    baseMm: 9120,
    couplerMm: 14720,
    bogieMm: 1800,
  },
  {
    id: 'covered-11-132',
    name: 'Крытый 11-132',
    baseMm: 9120,
    couplerMm: 14600,
    bogieMm: 1800,
  },
  {
    id: 'gondola-12-132',
    name: 'Полувагон 12-132',
    baseMm: 9120,
    couplerMm: 14600,
    bogieMm: 1800,
  },
  {
    id: 'gondola-12-134',
    name: 'Полувагон 12-134',
    baseMm: 9120,
    couplerMm: 14600,
    bogieMm: 1800,
  },
  {
    id: 'tank-15-1548',
    name: 'Цистерна 15-1548',
    baseMm: 10500,
    couplerMm: 16100,
    bogieMm: 1800,
  },
  {
    id: 'platform-13-401',
    name: 'Платформа 13-401',
    baseMm: 10500,
    couplerMm: 16100,
    bogieMm: 1800,
  },
  {
    id: 'mineral-15-6721',
    name: 'Минераловоз 15-6721',
    baseMm: 8650,
    couplerMm: 14100,
    bogieMm: 1710,
  },
  {
    id: 'hopper-19-986',
    name: 'Хоппер-дозатор 19-986',
    baseMm: 7855,
    couplerMm: 12520,
    bogieMm: 1710,
  },
];

export type WagonPreset = WagonType;

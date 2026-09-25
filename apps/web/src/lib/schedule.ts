export const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

/** Whole days from now until `iso`, floored at 1 so a due/overdue date never reads as "0 days". */
export function daysUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export interface Session {
  date: Date;
  weekday: number;
  dayIndex: number; // days elapsed since `from`
}

/** Walks forward from `from` (inclusive) collecting `count` dates whose weekday is in `lessonDays`. */
export function buildSessions(from: Date, lessonDays: number[], count: number): Session[] {
  const days = lessonDays.length ? lessonDays : [1];
  const sessions: Session[] = [];
  const base = startOfDay(from);
  for (let i = 0; sessions.length < count && i < 400; i++) {
    const date = new Date(base.getTime() + i * 86400000);
    const weekday = weekdayMon0(date);
    if (days.indexOf(weekday) >= 0) sessions.push({ date, weekday, dayIndex: i });
  }
  return sessions;
}

export function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

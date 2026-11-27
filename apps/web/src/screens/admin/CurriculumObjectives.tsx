import { useEffect, useState } from 'react';
import { getJson } from '../../lib/collections';

type Metrics = {
  assignments: number; assigned_users: number; opens: number; started_users: number; engaged_users: number;
  checks: number; failed: number; passed_users: number; mastered_users: number;
  recommended_checks: number; independent_checks: number; review_checks: number;
};
type Objective = {
  id: string; title: string; level: string; category: string; objective: string; linked_lessons: number; metrics: Metrics | null;
  lessons: { id: string; title: string; current: boolean; metrics: Metrics | null }[];
};

function Counts({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return <p className="text-meta">За период нет событий с подтверждённой связью с целью.</p>;
  return <>
    <p className="text-meta">
      Назначений {metrics.assignments} · назначено ученикам {metrics.assigned_users} · открытий {metrics.opens} ·
      приступили к упражнениям {metrics.started_users} · всего с активностью {metrics.engaged_users}
    </p>
    <p className="text-meta">
      Завершено проверок {metrics.checks} · не сдали {metrics.failed} · успешно сдали {metrics.passed_users} ·
      подтвердили при повторении {metrics.mastered_users}
    </p>
    <p className="text-meta">
      Первичные проверки по рекомендации {metrics.recommended_checks} · самостоятельные {metrics.independent_checks} ·
      повторные {metrics.review_checks}
    </p>
  </>;
}

export function CurriculumObjectives({ query }: { query: string }) {
  const [rows, setRows] = useState<Objective[]>();
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(20);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRows(undefined);
    setFailed(false);
    void getJson<{ objectives: Objective[] }>(`/api/admin/analytics/objectives?${query}`).then(
      ({ objectives }) => { if (active) setRows(objectives); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [query, retry]);

  const term = search.trim().toLowerCase();
  const matching = rows?.filter(({ title, id, level, category }) => [title, id, level, category].some((value) => value.toLowerCase().includes(term)));
  return <section className="space-y-3 border-b border-border pb-4">
    <h2 className="text-section-title">Учебные цели CEFR</h2>
    <p className="text-meta">Цели объединяют показатели разных уроков. Старые события без зафиксированного ID цели не входят в эти показатели.</p>
    <label className="grid max-w-sm gap-1 text-meta">Поиск по названию, уровню или категории
      <input className="rounded-lg border border-border bg-surface p-2 text-text" value={search}
        onChange={(event) => { setSearch(event.target.value); setShown(20); }} />
    </label>
    {failed ? <button className="text-accent" type="button" onClick={() => setRetry((value) => value + 1)}>Повторить загрузку целей</button>
      : !matching ? <p role="status" className="text-meta">Загружаем цели…</p> : matching.length === 0 ? <p className="text-meta">Нет подходящих целей.</p> : (
        <div className="divide-y divide-border">
          {matching.slice(0, shown).map(({ id, title, level, category, objective, linked_lessons, metrics, lessons }) => (
            <details key={id} className="space-y-2 py-3">
              <summary className="cursor-pointer font-medium">{title}
                <span className="ml-2 text-meta">{level} · {category} · уроков {linked_lessons} · назначений {metrics?.assignments ?? 0} · проверок {metrics?.checks ?? 0}</span>
              </summary>
              <p className="text-sm">{objective}</p>
              <Counts metrics={metrics} />
              {lessons.length > 0 && <ul className="divide-y divide-border pl-3">
                {lessons.map((lesson) => <li key={lesson.id} className="py-2">
                  <p className="text-sm font-medium">{lesson.title}{!lesson.current && ' · прежняя связь'}</p>
                  <Counts metrics={lesson.metrics} />
                </li>)}
              </ul>}
            </details>
          ))}
          {shown < matching.length && <button className="py-2 text-accent" type="button" onClick={() => setShown((value) => value + 20)}>Показать ещё</button>}
        </div>
      )}
  </section>;
}

import { useEffect, useState, type ReactNode } from 'react';
import type { CurriculumModule } from '@app/shared';
import { Button } from '../components/ui/Button';
import { getJson } from '../lib/collections';
import type { UserTopicSummary } from '../lib/program';

type LearningModule = Pick<CurriculumModule, 'id' | 'title' | 'description' | 'level' | 'type'> & {
  topics: { id: string; title: string }[];
};

export function ProgramModules({ topics, userId, renderTopic }: {
  topics: UserTopicSummary[];
  userId?: string;
  renderTopic: (topic: UserTopicSummary) => ReactNode;
}) {
  const [catalog, setCatalog] = useState<{ userId: string; modules: LearningModule[] }>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const assignmentKey = topics.map(({ id, curriculumId }) => id + ':' + (curriculumId ?? '')).sort().join(',');

  useEffect(() => {
    if (!userId || !assignmentKey) return;
    let active = true;
    getJson<{ modules: LearningModule[] }>('/api/program/modules').then(
      ({ modules }) => { if (active) setCatalog({ userId, modules }); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [userId, assignmentKey, retry]);

  const assignedById = new Map<string, UserTopicSummary[]>();
  for (const topic of topics) {
    if (!topic.curriculumId) continue;
    const assignments = assignedById.get(topic.curriculumId);
    if (assignments) assignments.push(topic);
    else assignedById.set(topic.curriculumId, [topic]);
  }
  const modules = (catalog?.userId === userId ? catalog?.modules ?? [] : []).filter((module) =>
    module.topics.some(({ id }) => assignedById.has(id)));
  const grouped = new Set(modules.flatMap((module) => module.topics.flatMap(({ id }) => (assignedById.get(id) ?? []).map((topic) => topic.id))));
  const ungrouped = topics.filter(({ id }) => !grouped.has(id));

  return (
    <div className="space-y-4">
      {failed && <div className="mt-2 flex flex-wrap items-center gap-2">
        <p role="alert" className="text-meta">Не удалось загрузить учебные модули.</p>
        <Button size="sm" variant="ghost" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>Повторить</Button>
      </div>}
      {modules.map((module) => {
        const assigned = module.topics.flatMap(({ id }) => assignedById.get(id) ?? []);
        const mastered = assigned.filter(({ status }) => status === 'mastered').length;
        return (
          <section key={module.id} className="border-b border-border py-3">
            <h2 className="text-section-title">{module.title}</h2>
            <p className="text-meta">{module.level} · {module.type === 'core' ? 'Основной модуль' : 'Дополнительный модуль'}</p>
            <p className="mt-1 text-body-secondary">{module.description}</p>
            <p className="mt-2 text-sm font-medium">Освоено {mastered} из {assigned.length} рекомендованных тем</p>
            <div>{assigned.map(renderTopic)}</div>
            {module.topics.some(({ id }) => !assignedById.has(id)) && (
              <details className="py-3">
                <summary className="cursor-pointer text-sm font-medium">Темы, по которым знания ещё не проверены</summary>
                <ul className="mt-2 space-y-2 text-body-secondary">
                  {module.topics.filter(({ id }) => !assignedById.has(id)).map(({ id, title }) => <li key={id}>{title}</li>)}
                </ul>
              </details>
            )}
          </section>
        );
      })}
      {ungrouped.length > 0 && (
        <section>
          {catalog?.userId === userId && <h2 className="text-section-title">Темы вне модулей</h2>}
          {ungrouped.map(renderTopic)}
        </section>
      )}
    </div>
  );
}

import { ChevronRight, Star } from 'lucide-react';
import { track } from '../lib/productAnalytics';
import { useEffect, useState, type ReactNode } from 'react';
import type { CurriculumModule } from '@app/shared';
import { Button } from '../components/ui/Button';
import { ApiError, getJson } from '../lib/collections';
import { startIndependentTopic, type UserTopicSummary } from '../lib/program';
import { useAppStore } from '../store/appStore';

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
  const [opening, setOpening] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  async function openIndependent(curriculumId: string, check: boolean) {
    const view = useAppStore.getState().grammarView;
    setOpening(curriculumId);
    setActionError(undefined);
    try {
      const { topicId } = await startIndependentTopic(curriculumId);
      const program = await useAppStore.getState().loadProgram();
      const state = useAppStore.getState();
      if (state.user?.id !== userId || state.screen !== 'program' || state.grammarView !== view) return;
      if (program?.status !== 'active' || !program.topics.some(({ id }) => id === topicId)) {
        throw new Error('Topic unavailable');
      }
      if (check) {
        await state.goExercises(topicId);
      } else {
        if (program.topics.some(({ id, source }) => id === topicId && source === 'self')) {
          track(userId, 'starred_topic_study_started', { contentId: topicId, context: 'independent' });
        }
        await state.openTopic(topicId);
      }
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 403
        ? 'Занятия по темам недоступны на вашем тарифе.'
        : 'Не удалось открыть тему. Попробуйте ещё раз.');
    } finally {
      setOpening(undefined);
    }
  }

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
      {actionError && <p role="alert" className="text-negative">{actionError}</p>}
      {modules.map((module) => {
        const assigned = module.topics.flatMap(({ id }) => assignedById.get(id) ?? []);
        const recommended = assigned.filter(({ source }) => source !== 'self');
        const unchecked = module.topics.filter(({ id }) => {
          const entries = assignedById.get(id);
          return !entries || entries.every(({ source, status }) => source === 'self' && status === 'assigned');
        });
        const uncheckedIds = new Set(unchecked.map(({ id }) => id));
        const mastered = recommended.filter(({ status }) => status === 'mastered').length;
        return (
          <section key={module.id} className="space-y-2 border-b border-border pb-4 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 text-sm font-semibold wrap-anywhere">{module.title}</h2>
              <p className="shrink-0 text-meta tabular-nums">
                {module.level} <span aria-hidden="true">·</span>{' '}
                <span aria-label={`Освоено ${mastered} из ${recommended.length} рекомендованных тем`}>{mastered}/{recommended.length}</span>
              </p>
            </div>
            <p className="text-meta">{module.description}</p>
            <div className="space-y-1">{assigned.filter(({ curriculumId }) => !curriculumId || !uncheckedIds.has(curriculumId)).map(renderTopic)}</div>
            {unchecked.length > 0 && (
              <details className="group rounded-lg border border-border">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 text-sm [&::-webkit-details-marker]:hidden">
                  <Star size={15} className="shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="flex-1">Темы под звёздочкой</span>
                  <ChevronRight size={15} className="shrink-0 text-text-secondary group-open:rotate-90" aria-hidden="true" />
                </summary>
                <ul className="divide-y divide-border border-t border-border px-2.5">
                  {unchecked.map(({ id, title }) => (
                    <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0 text-body-secondary wrap-anywhere">{title}</span>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" disabled={!!opening} onClick={() => void openIndependent(id, false)}>Изучить</Button>
                        <Button size="sm" variant="ghost" disabled={!!opening} onClick={() => void openIndependent(id, true)}>
                          {opening === id ? 'Открываем…' : 'Проверить знания'}
                        </Button>
                      </div>
                    </li>
                  ))}
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

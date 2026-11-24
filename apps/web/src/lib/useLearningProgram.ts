import { CEFR_LEVELS } from '@app/shared';
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { rebuildProgram, type UserTopicSummary } from './program';

export function useLearningProgram() {
  const s = useAppStore();
  const current = s.learningTopic?.userId === s.user?.id
    ? s.programTopics.find(({ id, status }) => id === s.learningTopic?.topicId && status === 'assigned')
    : undefined;
  const difficulty = ({ level }: UserTopicSummary) => level ? CEFR_LEVELS.indexOf(level) : CEFR_LEVELS.length;
  const topics = current
    ? [...s.programTopics.filter(({ status }) => status !== 'assigned'), current,
      ...s.programTopics.filter((topic) => topic.status === 'assigned' && topic.id !== current.id)
        .sort((a, b) => difficulty(a) - difficulty(b))]
    : s.programTopics;
  const userId = s.user?.id;
  const [phase, setPhase] = useState<'loading' | 'building' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const { loadProgram } = useAppStore.getState();

    async function prepare() {
      setPhase('loading');
      try {
        const current = await loadProgram();
        if (!active) return;
        if (!current) throw new Error('Program unavailable');
        if (current.needsProgramBuild) {
          setPhase('building');
          const { status } = await rebuildProgram();
          if (!active) return;
          if (status === 'building') {
            // Another tab or a previous visit already holds the build lease.
            for (let attempt = 0; attempt < 30 && active; attempt += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 1500));
              if (!active) return;
              const updated = await loadProgram();
              if (updated && !updated.needsProgramBuild) break;
              if (attempt === 29) throw new Error('Program build pending');
            }
          } else {
            const updated = await loadProgram();
            if (!updated || updated.needsProgramBuild) throw new Error('Program build pending');
          }
        }
        if (active) setPhase('ready');
      } catch {
        if (active) setPhase('error');
      }
    }

    void prepare();
    return () => { active = false; };
  }, [retry, userId]);
  const latest = s.placementOverview?.history[0];
  const goal = latest?.goal ?? s.to;
  const mastered = topics.filter((topic) => topic.status === 'mastered').length;
  const pending = topics.filter((topic) => topic.status === 'passed_once');
  const now = Date.now();
  const due = pending.filter((topic) => topic.nextReviewAt && Date.parse(topic.nextReviewAt) <= now);
  const next = topics.find((topic) => topic.status === 'assigned');
  return { topics, userId, phase, retryLoading: () => setRetry((value) => value + 1), latest, goal, mastered, pending, now, due, next };
}

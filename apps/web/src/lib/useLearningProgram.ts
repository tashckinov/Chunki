import { CEFR_LEVELS } from '@app/shared';
import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { loadDailyLearningPlan, rebuildProgram, type DailyLearningPlan, type UserTopicSummary } from './program';

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
  const [daily, setDaily] = useState<{ userId: string; placementId: string; plan: DailyLearningPlan | null }>();
  const [failedPlanOwner, setFailedPlanOwner] = useState<string>();
  const latestId = latest?.id;
  useEffect(() => {
    if (!userId || !latestId || phase !== 'ready') return;
    const owner = userId;
    const placementId = latestId;
    let active = true;
    let request = 0;
    async function refresh() {
      const id = ++request;
      try {
        const { plan } = await loadDailyLearningPlan();
        if (active && id === request) {
          setDaily({ userId: owner, placementId, plan });
          setFailedPlanOwner(undefined);
        }
      } catch {
        if (active && id === request) setFailedPlanOwner(owner);
      }
    }
    let day = new Date().toDateString();
    const timer = window.setInterval(() => {
      const today = new Date().toDateString();
      if (day === today) return;
      day = today;
      void refresh();
    }, 60_000);
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [userId, latestId, phase, retry]);

  const recommended = topics.filter(({ source }) => source !== 'self');
  const mastered = recommended.filter(({ status }) => status === 'mastered').length;
  const pending = recommended.filter(({ status }) => status === 'passed_once');
  return { topics, userId, phase, retryLoading: () => setRetry((value) => value + 1), latest, goal, mastered,
    pending, now: Date.now(), recommendedCount: recommended.length,
    dailyPlan: daily && daily.userId === userId && daily.placementId === latestId ? daily.plan : undefined,
    planError: !!userId && failedPlanOwner === userId };
}

import { useEffect, useState } from 'react';
import { loadDailyLearningPlan, type DailyLearningPlan } from '../lib/program';
import { useAppStore } from '../store/appStore';
import { formatDayMonth } from '../lib/schedule';
import { CircularProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';

export function TopicResultScreen() {
  const s = useAppStore();
  const result = s.exerciseResult;
  const topic = s.programTopics.find((t) => t.id === s.activeTopicId);

  const session = s.dailySession?.userId === s.user?.id ? s.dailySession : null;
  const [updated, setUpdated] = useState<DailyLearningPlan | null>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session || !result) return;
    let active = true;
    setUpdated(undefined);
    setFailed(false);
    void loadDailyLearningPlan().then(
      ({ plan }) => { if (active) setUpdated(plan); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [result, session, retry]);

  if (!result || !topic) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Не получилось проверить упражнения</div>
        <div className="text-body-secondary">{s.gradingError || 'Попробуйте ещё раз.'}</div>
        <Button size="sm" onClick={() => void s.goExercises()}>
          Пройти упражнения заново
        </Button>
      </div>
    );
  }

  const next = updated?.day === session?.plan.day ? updated?.steps.find(({ done }) => !done) : undefined;

  function advance() {
    if (!session) {
      s.goProgram();
    } else if (updated && next && next.topic.id !== s.activeTopicId) {
      void s.openTopic(next.topic.id, 'study', { ...session, plan: updated });
    } else {
      s.go(session.origin);
    }
  }

  const reviewDate = topic.status === 'passed_once' && topic.nextReviewAt ? new Date(topic.nextReviewAt) : null;
  const reviewLabel = reviewDate ? formatDayMonth(reviewDate) : null;

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 pt-4 pb-8 flex flex-col gap-8 anim-rise">
      <div className="flex items-center gap-5">
        <div className="relative w-20 h-20 flex-none flex items-center justify-center">
          <CircularProgress value={result.scoreOutOf10 / 10} size={80} thickness={6} />
          <div className="absolute text-[20px] font-semibold">{result.scoreOutOf10}/10</div>
        </div>
        <div className="flex-1">
          <div className="text-[21px] font-semibold leading-7">{result.verdictLabel}</div>
          <div className="text-body-secondary mt-0.5">{topic.title}</div>
        </div>
      </div>

      {topic.status === 'mastered' && <div className="text-[14.5px] text-accent">✓ Тема подтверждена — переподтверждение пройдено.</div>}
      {reviewLabel && <div className="text-[14.5px] text-text-secondary">Контрольная проверка через {result.nextReviewInDays} дн. — {reviewLabel}</div>}
      {!result.passed && <div className="text-[14.5px] text-text-secondary">Тема нуждается в повторном изучении — вернитесь к материалу и попробуйте ещё раз.</div>}

      {!!result.corrections?.length && (
        <section aria-labelledby="exercise-corrections">
          <h2 id="exercise-corrections" className="text-section-title mb-2">Разбор ошибок</h2>
          <ul className="divide-y divide-border">
            {result.corrections.map(({ questionNumber, prompt, answer, correction, explanation }) => (
              <li key={questionNumber}>
                <details className="py-3">
                  <summary className="cursor-pointer text-sm font-semibold wrap-anywhere">
                    №{questionNumber}. {prompt}
                  </summary>
                  <dl className="mt-3 space-y-2 text-sm wrap-anywhere">
                    <div><dt className="text-meta">Ваш ответ</dt><dd className="whitespace-pre-wrap">{answer.trim() ? answer : 'Без ответа'}</dd></div>
                    {correction && <div><dt className="text-meta">Подходящий ответ</dt><dd className="whitespace-pre-wrap">{correction}</dd></div>}
                    <div><dt className="text-meta">Объяснение</dt><dd>{explanation}</dd></div>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.notes.length > 0 && (
        <div>
          <div className="text-section-title mb-3">Заметки</div>
          <div className="flex flex-col gap-2.5">
            {result.notes.map((note, i) => (
              <div key={i} className="flex gap-3 text-[15px] leading-[22px]">
                <span className="w-1 rounded-full bg-accent flex-none" />
                <div>{note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.newTopicsAddedLastResult > 0 && (
        <div className="text-body-secondary border-l-2 border-accent pl-4">
          ИИ нашёл {s.newTopicsAddedLastResult} {s.newTopicsAddedLastResult === 1 ? 'новую тему' : 'новые темы'} и добавил их в программу.
        </div>
      )}

      <div className="flex flex-col gap-2 mt-auto">
        {session && failed ? <>
          <p role="alert" className="text-negative text-sm">Не удалось обновить план занятия.</p>
          <Button size="lg" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>
          <Button variant="ghost" onClick={advance}>К плану</Button>
        </> : <Button size="lg" onClick={advance} disabled={!!session && updated === undefined} className="w-full">
          {!session ? 'К программе' : updated === undefined ? 'Обновляем план…' : next ? 'Следующий шаг' : 'Завершить занятие'}
        </Button>}
      </div>
    </div>
  );
}

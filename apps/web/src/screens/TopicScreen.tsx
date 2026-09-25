import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Button } from '../components/ui/Button';

function daysUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export function TopicScreen() {
  const s = useAppStore();
  const topic = s.programTopics.find((t) => t.id === s.activeTopicId);
  const study = s.activeTopicId ? s.topicStudyByTopic[s.activeTopicId] : undefined;

  if (!topic) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Тема не найдена</div>
        <Button size="sm" onClick={s.goProgram}>
          К программе
        </Button>
      </div>
    );
  }

  const waitingForReconfirm = topic.status === 'passed_once' && topic.nextReviewAt && new Date(topic.nextReviewAt).getTime() > Date.now();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title={topic.category} onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-7">
        <div>
          <div className="text-page-title">{topic.title}</div>
          <div className="text-meta mt-1.5">{topic.rationale}</div>
        </div>

        {!study && !s.topicStudyError && <div className="text-body-secondary py-8 text-center">Готовим материал…</div>}

        {!study && s.topicStudyError && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="text-body-secondary">Не получилось загрузить материал.</div>
            <Button size="sm" onClick={() => void s.openTopic(topic.id)}>
              Повторить
            </Button>
          </div>
        )}

        {study && (
          <>
            <p className="text-[17px] leading-[27px]">{study.explanation}</p>

            {study.keyPoints.length > 0 && (
              <div>
                <div className="text-section-title mb-3">Ключевые моменты</div>
                <div className="flex flex-col gap-2">
                  {study.keyPoints.map((point, i) => (
                    <div key={i} className="flex gap-3 text-[15px] leading-[22px]">
                      <span className="w-1 rounded-full bg-accent flex-none" />
                      <div>{point}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {study.contrastExamples.length > 0 && (
              <div className="flex flex-col divide-y divide-border border-t border-b border-border">
                {study.contrastExamples.map((c, i) => (
                  <div key={i} className="flex gap-4 py-4">
                    <div className="flex-1 text-[15px] leading-[22px] text-negative">
                      <div className="text-meta mb-1">Неверно</div>
                      {c.wrong}
                    </div>
                    <div className="flex-1 text-[15px] leading-[22px]">
                      <div className="text-[12.5px] font-medium text-accent mb-1">Верно</div>
                      {c.right}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {study.exampleChunks.length > 0 && (
              <div>
                <div className="text-section-title mb-3">Полезные выражения</div>
                <div className="flex gap-2 flex-wrap">
                  {study.exampleChunks.map((chunk) => (
                    <span key={chunk} className="rounded-full bg-surface-subtle px-3.5 py-2 text-[14px] text-text-secondary">
                      {chunk}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {topic.status === 'mastered' && <div className="text-body-secondary border-l-2 border-accent pl-4">✓ Тема подтверждена.</div>}
        {waitingForReconfirm && topic.nextReviewAt && (
          <div className="text-body-secondary border-l-2 border-border pl-4">Контрольная проверка будет доступна через {daysUntil(topic.nextReviewAt)} дн.</div>
        )}
        {topic.status !== 'mastered' && !waitingForReconfirm && (
          <Button size="lg" onClick={() => void s.goExercises()} className="w-full">
            К упражнениям
          </Button>
        )}
      </div>
    </div>
  );
}

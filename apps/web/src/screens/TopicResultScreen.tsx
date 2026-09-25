import { useAppStore } from '../store/appStore';
import { formatDayMonth } from '../lib/schedule';
import { CircularProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';

export function TopicResultScreen() {
  const s = useAppStore();
  const result = s.exerciseResult;
  const topic = s.programTopics.find((t) => t.id === s.activeTopicId);

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
        <Button size="lg" onClick={s.goProgram} className="w-full">
          К программе
        </Button>
      </div>
    </div>
  );
}

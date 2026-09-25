import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Button } from '../components/ui/Button';
import { ExerciseOption } from '../components/ui/ExerciseOption';
import { Textarea } from '../components/ui/Textarea';

export function ExercisesScreen() {
  const s = useAppStore();
  const attempt = s.currentAttempt;
  const topic = s.programTopics.find((t) => t.id === s.activeTopicId);

  if (!attempt) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Готовим упражнения…</div>
        {s.gradingError && <div className="text-body-secondary">{s.gradingError}</div>}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="center" title={topic?.title ?? 'Упражнения'} onBack={s.back} />
      <div className="scroll-clean flex-1 min-h-0 px-5 pt-5 pb-8 flex flex-col gap-10">
        <div className="text-meta -mb-4 lowercase">{attempt.attemptKind === 'reconfirm' ? 'контрольная проверка' : 'упражнения'}</div>

        {attempt.items.map((item, i) => (
          <div key={i} className="flex flex-col gap-4">
            <div className="text-[17px] leading-[26px]">
              {i + 1}. {item.q}
            </div>
            {item.type === 'choice' ? (
              <div className="flex flex-col gap-2.5">
                {item.options.map((opt) => (
                  <ExerciseOption key={opt} selected={s.topicAnswers[i] === opt} onClick={() => s.setTopicAnswer(i, opt)}>
                    {opt}
                  </ExerciseOption>
                ))}
              </div>
            ) : (
              <Textarea value={s.topicAnswers[i] || ''} onChange={(v) => s.setTopicAnswer(i, v)} placeholder={item.placeholder} rows={item.rows} />
            )}
          </div>
        ))}

        <Button size="lg" onClick={s.exPrimary} className="w-full">
          Отправить на проверку
        </Button>
        <div className="text-meta text-center -mt-6">Открытые ответы проверяем по смыслу.</div>
      </div>
    </div>
  );
}

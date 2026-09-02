import { ESSAY_PROMPT, READING_PASSAGE, READING_QUESTIONS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { useTestView } from '../store/derived';
import { NavigationBar } from '../components/ui/NavigationBar';
import { LinearProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { ExerciseOption } from '../components/ui/ExerciseOption';
import { Textarea } from '../components/ui/Textarea';

export function TestScreen() {
  const s = useAppStore();
  const v = useTestView();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="center" title={v.testTitle} onBack={s.back} />
      <div className="px-5 pb-4">
        <LinearProgress value={v.testValue} />
      </div>
      <div className="px-5 pb-4 text-meta">Не пользуйся переводчиком и не гугли. Если не знаешь — так и пиши.</div>

      {s.testPart === 1 && (
        <div className="scroll-clean flex-1 min-h-0 px-5 pb-6 flex flex-col gap-6">
          <div>
            <div className="text-meta mb-2">
              Часть 1 · Grammar &amp; Vocabulary · {v.mqCounter}
            </div>
            <div className="text-[22px] leading-[30px] font-medium">{v.mq.q}</div>
          </div>
          <div className="flex flex-col gap-2.5">
            {v.mqOptions.map((o) => (
              <ExerciseOption key={o.letter} letter={o.letter} selected={o.selected} onClick={o.pick}>
                {o.label}
              </ExerciseOption>
            ))}
            <button
              type="button"
              onClick={s.pickUnknown}
              className={`pressable w-full rounded-[var(--radius-md)] border px-4 py-3 text-center text-[14.5px] ${
                v.unknown ? 'border-text-secondary text-text' : 'border-border text-text-secondary'
              }`}
            >
              Не знаю
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={s.prevQ} disabled={v.atFirstQ}>
              Назад
            </Button>
            <div className="flex-1" />
            <Button size="sm" onClick={s.nextQ} disabled={v.mqUnanswered}>
              {v.nextQLabel}
            </Button>
          </div>
        </div>
      )}

      {s.testPart === 2 && (
        <div className="scroll-clean flex-1 min-h-0 px-5 pb-6 flex flex-col gap-6">
          <div className="text-meta">Часть 2 · Reading</div>
          <p className="text-[17px] leading-[27px] border-l-2 border-border pl-4">{READING_PASSAGE}</p>
          <div className="flex flex-col gap-3">
            <div className="text-body">
              {READING_QUESTIONS[0].n}. {READING_QUESTIONS[0].q}{' '}
              <span className="text-text-secondary">Ответь своими словами на английском, не копируя предложение.</span>
            </div>
            <Textarea value={s.open9} onChange={s.setOpen9} placeholder="Your answer" rows={3} />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-body">
              {READING_QUESTIONS[1].n}. {READING_QUESTIONS[1].q}
            </div>
            <Textarea value={s.open10} onChange={s.setOpen10} placeholder="Your answer" rows={3} />
          </div>
          <Button size="lg" onClick={s.goPart3} className="w-full">
            Часть 3
          </Button>
        </div>
      )}

      {s.testPart === 3 && (
        <div className="scroll-clean flex-1 min-h-0 px-5 pb-6 flex flex-col gap-6">
          <div className="text-meta">Часть 3 · Active English</div>
          <div className="text-body">11. Напиши 5–8 предложений на английском:</div>
          <p className="text-[19px] leading-[28px] italic border-l-2 border-accent pl-4">{ESSAY_PROMPT}</p>
          <div className="text-body-secondary -mt-3">Не старайся специально писать сложно. Пиши так, как реально написал бы человеку в переписке.</div>
          <Textarea value={s.essay} onChange={s.setEssay} placeholder="Your answer" rows={9} />
          <div className="flex justify-between text-meta -mt-3">
            <span>{v.essayWords} слов</span>
            <span>нужно 5–8 предложений</span>
          </div>
          <Button size="lg" onClick={s.submitTest} className="w-full">
            Отправить на проверку
          </Button>
        </div>
      )}
    </div>
  );
}

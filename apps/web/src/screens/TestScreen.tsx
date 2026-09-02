import { ESSAY_PROMPT, READING_PASSAGE, READING_QUESTIONS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { useTestView } from '../store/derived';
import { TopAppBar } from '../components/ui/TopAppBar';
import { LinearProgress } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';

export function TestScreen() {
  const s = useAppStore();
  const v = useTestView();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopAppBar size="center" title={v.testTitle} onBack={s.back} />
      <div className="px-4 pb-3">
        <LinearProgress value={v.testValue} />
      </div>
      <div className="mx-4 mb-3 p-4 rounded-xl bg-tertiary-container text-on-tertiary-container text-[13px] leading-[18px] tracking-[0.25px]">
        Не пользуйся переводчиком и не гугли. Если не знаешь — так и пиши.
      </div>

      {s.testPart === 1 && (
        <div className="scroll-clean flex-1 min-h-0 px-4 pb-6 flex flex-col gap-3.5">
          <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">
            ЧАСТЬ 1 · GRAMMAR &amp; VOCABULARY · {v.mqCounter}
          </div>
          <div className="text-[22px] leading-[30px]">
            {v.mq.n}. {v.mq.q}
          </div>
          <div className="flex flex-col gap-2.5">
            {v.mqOptions.map((o) => (
              <div
                key={o.letter}
                onClick={o.pick}
                className="cursor-pointer flex gap-3 items-start px-4 py-3.5 rounded-xl text-base leading-[22px] tracking-[0.25px]"
                style={{ border: `1px solid ${o.border}`, background: o.bg, color: o.fg }}
              >
                <div className="font-medium flex-none w-4">{o.letter}</div>
                <div>{o.label}</div>
              </div>
            ))}
            <div
              onClick={s.pickUnknown}
              className="cursor-pointer px-4 py-3.5 rounded-xl text-[15px] tracking-[0.25px] text-center border-dashed"
              style={{
                border: `1px dashed ${v.unknown ? 'var(--md-on-surface-variant)' : 'var(--md-outline-variant)'}`,
                background: v.unknown ? 'var(--md-surface-container-highest)' : 'transparent',
                color: v.unknown ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
              }}
            >
              Не знаю
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2 items-center">
            <Button variant="text" size="s" onClick={s.prevQ} disabled={v.atFirstQ}>
              Назад
            </Button>
            <div className="flex-1" />
            <Button variant="filled" size="s" onClick={s.nextQ} disabled={v.mqUnanswered}>
              {v.nextQLabel}
            </Button>
          </div>
        </div>
      )}

      {s.testPart === 2 && (
        <div className="scroll-clean flex-1 min-h-0 px-4 pb-6 flex flex-col gap-4">
          <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">ЧАСТЬ 2 · READING</div>
          <div className="text-[17px] leading-7 tracking-[0.25px] p-[18px] rounded-xl bg-surface-container-low">{READING_PASSAGE}</div>
          <div className="text-base leading-6 tracking-[0.25px]">
            {READING_QUESTIONS[0].n}. {READING_QUESTIONS[0].q}{' '}
            <span className="text-on-surface-variant">Ответь своими словами на английском, не копируя предложение.</span>
          </div>
          <textarea
            value={s.open9}
            onChange={(e) => s.setOpen9(e.target.value)}
            placeholder="Your answer"
            rows={3}
            className="w-full box-border p-3.5 rounded-lg border border-outline bg-transparent text-on-surface text-base leading-6 resize-none outline-none"
          />
          <div className="text-base leading-6 tracking-[0.25px]">
            {READING_QUESTIONS[1].n}. {READING_QUESTIONS[1].q}
          </div>
          <textarea
            value={s.open10}
            onChange={(e) => s.setOpen10(e.target.value)}
            placeholder="Your answer"
            rows={3}
            className="w-full box-border p-3.5 rounded-lg border border-outline bg-transparent text-on-surface text-base leading-6 resize-none outline-none"
          />
          <Button variant="filled" size="m" onClick={s.goPart3} className="w-full h-14">
            Часть 3
          </Button>
        </div>
      )}

      {s.testPart === 3 && (
        <div className="scroll-clean flex-1 min-h-0 px-4 pb-6 flex flex-col gap-4">
          <div className="text-xs font-medium tracking-[0.5px] text-on-surface-variant">ЧАСТЬ 3 · ACTIVE ENGLISH</div>
          <div className="text-base leading-6 tracking-[0.25px]">11. Напиши 5–8 предложений на английском:</div>
          <div className="text-[19px] leading-7 p-4 rounded-xl bg-secondary-container text-on-secondary-container">
            "{ESSAY_PROMPT}"
          </div>
          <div className="text-sm leading-5 tracking-[0.25px] text-on-surface-variant">
            Не старайся специально писать сложно. Пиши так, как реально написал бы человеку в переписке.
          </div>
          <textarea
            value={s.essay}
            onChange={(e) => s.setEssay(e.target.value)}
            placeholder="Your answer"
            rows={9}
            className="w-full box-border p-3.5 rounded-lg border border-outline bg-transparent text-on-surface text-base leading-6 resize-none outline-none"
          />
          <div className="flex justify-between text-xs tracking-[0.4px] text-on-surface-variant">
            <span>{v.essayWords} слов</span>
            <span>нужно 5–8 предложений</span>
          </div>
          <Button variant="filled" size="m" onClick={s.submitTest} className="w-full h-14">
            Отправить на проверку
          </Button>
        </div>
      )}
    </div>
  );
}

import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, BookOpen, MessageCircle, Languages, PencilLine } from 'lucide-react';
import type { AdminChunk } from '../../lib/admin';

export type ContentStage = 'card' | 'browse' | 'recognition' | 'answer';

export function answerFormat(chunk: AdminChunk): string {
  if (chunk.hasSituationDialogue) return 'Комикс';
  return chunk.situationPrompts.length > 0 ? 'Текст' : 'Нет проверки';
}

export function ContentJourney({ chunk, selected, onSelect, editors }: {
  chunk?: AdminChunk;
  selected?: ContentStage;
  onSelect: (stage: ContentStage) => void;
  editors?: Record<ContentStage, ReactNode>;
}) {
  const id = useId();
  const stages = [
    { key: 'card', title: 'Карточка', icon: BookOpen, note: chunk ? (chunk.sentences.length ? `Примеры: ${chunk.sentences.length}` : 'Без примеров') : 'Фраза, пояснение и пример на обороте' },
    { key: 'browse', title: 'После «Не знаю»', icon: MessageCircle, note: chunk ? (chunk.hasDialogue ? 'Комикс есть' : 'Комикса нет · сразу к переводу') : 'Комикс с примером, если он есть' },
    { key: 'recognition', title: 'Проверка понимания', icon: Languages, note: 'Выбрать перевод · один раз за сессию' },
    { key: 'answer', title: 'Проверка ответа', icon: PencilLine, note: chunk ? answerFormat(chunk) : 'Комикс или запасной текст' },
  ] as const;

  function node(stage: (typeof stages)[number]) {
    const Glyph = stage.icon;
    return (
      <button type="button" onClick={() => onSelect(stage.key)} aria-pressed={selected === stage.key}
        className={`flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${selected === stage.key ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:border-accent'}`}>
        <Glyph size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">{stage.title}</span>
          <span className="block text-meta">{stage.note}</span>
        </span>
      </button>
    );
  }

  if (editors) {
    const when: Record<ContentStage, string> = {
      card: 'В начале',
      browse: 'После «Не знаю»',
      recognition: 'После комикса или «Не уверен»',
      answer: 'После верного перевода или «Знаю»',
    };
    return (
      <section aria-label="Путь ученика" className="rounded-2xl border border-border bg-surface-subtle p-3 sm:p-4">
        <h2 className="text-[15px] font-semibold">Путь ученика</h2>
        <p className="mt-1 text-meta">Выберите этап, чтобы открыть его материалы и предпросмотр.</p>
        <div className="mt-3 flex flex-col gap-2">
          {stages.map((stage) => {
            const Glyph = stage.icon;
            const expanded = selected === stage.key;
            const stepId = `${id}-${stage.key}`;
            return (
              <div key={stage.key} className={`rounded-xl border bg-surface ${expanded ? 'border-accent' : 'border-border'}`}>
                <h3>
                  <button type="button" id={`${stepId}-button`} aria-expanded={expanded} aria-controls={stepId}
                    onClick={() => onSelect(stage.key)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent-subtle">
                    <Glyph size={19} className="shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{stage.key === 'browse' ? 'Комикс с примером' : stage.title}</span>
                      <span className="block text-meta">{when[stage.key]} · {stage.note}</span>
                    </span>
                    <ArrowDown size={16} className={`shrink-0 text-accent ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                </h3>
                <div id={stepId} role="region" aria-labelledby={`${stepId}-button`} hidden={!expanded}>
                  <div className="border-t border-border p-2.5 sm:p-3">{editors[stage.key]}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-meta">После «Знаю» проверка ждёт 2–4 учебных шага. Вердикт появится в отчёте колоды.</p>
      </section>
    );
  }

  return (
    <section aria-label="Путь ученика" className="rounded-2xl border border-border bg-surface-subtle p-4">
      <h2 className="mb-3 text-[15px] font-semibold">Путь ученика</h2>
      <div className="flex flex-col gap-2">
        {node(stages[0])}
        <ArrowDown size={16} className="mx-auto text-accent" aria-hidden="true" />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 rounded-xl border border-border p-2.5">
            {node(stages[1])}
            <p className="flex items-center gap-1.5 px-1 text-meta"><ArrowDown size={13} aria-hidden="true" /> После комикса или сразу при «Не уверен»</p>
            {node(stages[2])}
            <p className="px-1 text-meta">Верно → к проверке ответа. Неверно → к колоде.</p>
          </div>
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-border p-2.5">
            <p className="px-1 text-[14px] font-semibold">После «Знаю»</p>
            <p className="px-1 text-meta">Проверка ответа ждёт 2–4 учебных шага в очереди.</p>
          </div>
        </div>
        <ArrowDown size={16} className="mx-auto text-accent" aria-hidden="true" />
        {node(stages[3])}
        <p className="flex items-start gap-1.5 text-meta"><ArrowRight size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> Вердикт появится в отчёте колоды. Доступ к проверке зависит от тарифа и лимита.</p>
      </div>
    </section>
  );
}

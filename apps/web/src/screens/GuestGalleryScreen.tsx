import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { BookOpen } from 'lucide-react';
import { fetchRandomDialogue, getJson } from '../lib/collections';
import { InteractiveWords } from '../components/InteractiveWords';
import { DialoguePlayback, type PlaybackMessage } from '../components/dialogue/DialoguePlayback';
import { Logo } from '../components/brand/Logo';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { GUEST_DIALOGUE_MESSAGES, GUEST_TARGET_TEXT, GUEST_SITUATION_TEXT, GUEST_SAMPLE_ANSWER } from '../lib/guestPreview';

interface CatalogPreview {
  total: number;
  levels: Array<{ level: string; topics: Array<{ id: string; title: string }> }>;
}

export function GuestGalleryScreen() {
  const interfaceMode = useAppStore((s) => s.interfaceMode);
  const go = useAppStore((s) => s.go);
  // Starts on the hardcoded sample (guestPreview.ts) so the comic never
  // flashes empty, then swaps to a real random dialogue from the library
  // once it loads — silently keeps the sample if that fetch fails or the
  // library has no browse-kind dialogues yet (best-effort, non-blocking).
  const [realDialogue, setRealDialogue] = useState<{ messages: PlaybackMessage[]; targetText: string } | null>(null);

  const [catalog, setCatalog] = useState<CatalogPreview>();
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [level, setLevel] = useState('B1');
  useEffect(() => {
    let active = true;
    getJson<CatalogPreview>('/api/program/catalog-preview').then(
      (preview) => { if (active) setCatalog(preview); },
      () => { if (active) setCatalogError(true); },
    );
    return () => { active = false; };
  }, [catalogRetry]);

  useEffect(() => {
    let cancelled = false;
    fetchRandomDialogue()
      .then((d) => {
        if (!cancelled && d) setRealDialogue({ messages: d.messages, targetText: d.chunkText });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dialogueMessages = realDialogue?.messages ?? GUEST_DIALOGUE_MESSAGES;
  const dialogueTargetText = realDialogue?.targetText ?? GUEST_TARGET_TEXT;

  return (
    <div className="scroll-clean flex-1 min-h-0">
      <main className="mx-auto flex max-w-4xl flex-col gap-9 px-5 py-6 sm:px-8 sm:py-9">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-semibold"><Logo size={32} /> Chunki</div>
          <Button variant="ghost" onClick={() => go('profile')}>Войти</Button>
        </header>

        <section className="space-y-4 border-b border-border pb-8">
          <h1 className="text-page-title max-w-2xl">Английский по персональной программе с практикой живой речи</h1>
          <p className="text-body-secondary max-w-2xl">Определите свой уровень. Chunki подберёт грамматику, лексику и разговорные конструкции, которые пригодятся вам в диалогах и самостоятельных ответах.</p>
          <Button size="lg" onClick={() => go('profile')}>Начать обучение</Button>
        </section>

        <section className="space-y-3 border-b border-border pb-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section-title">Учебная программа</h2>
            {catalog && <span className="text-meta">Всего тем · {catalog.total}</span>}
          </div>
          {catalogError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-meta">Не удалось загрузить примеры тем.</p>
              <Button size="sm" variant="ghost" onClick={() => { setCatalogError(false); setCatalogRetry((n) => n + 1); }}>Повторить</Button>
            </div>
          ) : !catalog ? <p role="status" className="text-meta">Загружаем примеры тем…</p> : (
            <>
              <div role="group" aria-label="Уровень программы" className="flex flex-wrap gap-1">
                {catalog.levels.map((group) => (
                  <button key={group.level} type="button" aria-pressed={level === group.level} onClick={() => setLevel(group.level)}
                    className={'min-h-10 rounded-full px-3 text-sm ' + (level === group.level
                      ? 'bg-accent-subtle font-semibold text-accent' : 'text-text-secondary')}>
                    {group.level}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-border">
                {catalog.levels.find((group) => group.level === level)?.topics.map((topic) => (
                  <li key={topic.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <BookOpen size={16} className="shrink-0 text-accent" aria-hidden="true" />{topic.title}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-section-title">От выражения к своему ответу</h2>
          <div className="border-l-2 border-accent pl-3">
            <h3 className="text-meta">Карточка с устойчивым выражением</h3>
            <p lang="en" className="font-semibold">{GUEST_TARGET_TEXT}</p>
            <p className="text-body-secondary">Если подумать ещё раз</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <div className="min-w-0 space-y-2">
              <h3 className="font-semibold">Интерактивные комиксы</h3>
              <Card variant="surface" className="border border-border p-4">
                <DialoguePlayback messages={dialogueMessages} targetText={dialogueTargetText} />
              </Card>
            </div>
            <div className="min-w-0 space-y-2">
              <h3 className="font-semibold">Упражнения с самостоятельным ответом</h3>
              <Card variant="surface" className="border border-border p-4 flex flex-col gap-3">
                <div>
                  <div className="text-meta mb-2">Ситуация</div>
                  <InteractiveWords parts={[]} interfaceMode={interfaceMode} fallbackText={GUEST_SITUATION_TEXT}
                    textClassName="text-[17px] leading-[24px] font-medium not-italic" inactiveColorClassName="text-text" />
                </div>
                <Textarea value={GUEST_SAMPLE_ANSWER} onChange={() => {}} disabled rows={3} />
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Play, Volume2 } from 'lucide-react';
import type { ChunkSentence } from '../lib/collections';

function speak(text: string) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function splitExample(sentence: ChunkSentence) {
  const segments: { text: string; part?: ChunkSentence['parts'][number] }[] = [];
  const text = sentence.text.toLowerCase();
  let cursor = 0;
  for (const part of sentence.parts) {
    const fragment = part.text.trim();
    if (!fragment) continue;
    const start = text.indexOf(fragment.toLowerCase(), cursor);
    if (start < 0) continue;
    if (start > cursor) segments.push({ text: sentence.text.slice(cursor, start) });
    cursor = start + fragment.length;
    segments.push({ text: sentence.text.slice(start, cursor), part });
  }
  if (cursor < sentence.text.length) segments.push({ text: sentence.text.slice(cursor) });
  return segments;
}

export function StudyCardExample({ sentences, interfaceMode }: {
  sentences: ChunkSentence[];
  interfaceMode: 'ru-en' | 'en-en';
}) {
  const sentence = useMemo(() => sentences[Math.floor(Math.random() * sentences.length)], [sentences]);
  const [selected, setSelected] = useState<number | null>(null);
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  if (!sentence) return null;

  return (
    <section className="flex items-start gap-2 border-t border-border pt-3">
      {canSpeak && (
        <button type="button" aria-label="Озвучить пример" onClick={() => speak(sentence.text)}
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full bg-surface-subtle text-text-secondary">
          <Play size={17} fill="currentColor" aria-hidden="true" />
        </button>
      )}
      <p lang="en" className="min-w-0 wrap-anywhere text-[0.9375em] leading-[1.65]">
        {splitExample(sentence).map(({ text, part }, index) =>
          part ? (
            <Popover.Root key={index} open={selected === index}
              onOpenChange={(open) => setSelected((previous) => open ? index : previous === index ? null : previous)}>
              <Popover.Trigger aria-pressed={selected === index}
                className={`inline min-h-11 max-w-full wrap-anywhere rounded-lg border px-1.5 py-1 text-left align-baseline leading-normal outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent ${selected === index ? 'border-accent bg-accent-subtle text-accent' : 'border-transparent bg-surface-subtle text-text hover:border-border-strong'}`}>
                {text}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner side="top" sideOffset={8} collisionPadding={12} className="study-session z-40">
                  <Popover.Popup className="max-h-[var(--available-height)] w-max max-w-[min(18rem,var(--available-width))] overflow-y-auto rounded-2xl border border-border bg-surface px-4 py-3 text-text shadow-[var(--shadow-md)]">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 break-words">
                        <Popover.Title className="font-semibold" lang="en">{part.text}</Popover.Title>
                        <Popover.Description className="leading-relaxed text-text-secondary">
                          {interfaceMode === 'ru-en' ? part.explanationRu : part.explanationEn}
                        </Popover.Description>
                      </div>
                      {canSpeak && (
                        <button type="button" aria-label="Озвучить фрагмент" onClick={() => speak(part.text)}
                          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full bg-surface-subtle text-accent">
                          <Volume2 size={18} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          ) : <span key={index}>{text}</span>,
        )}
      </p>
    </section>
  );
}

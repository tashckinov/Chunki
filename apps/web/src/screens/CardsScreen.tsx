import { useMemo, useState } from 'react';
import { CARD_DECKS, CARDS } from '@app/shared';
import type { CEFRLevel } from '@app/shared';
import { Play, Check } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { plural } from '../lib/plural';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Card } from '../components/ui/Card';
import { CircularProgress } from '../components/ui/Progress';
import { Chip } from '../components/ui/Chip';

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'];

function DeckWidget({ deckId }: { deckId: string }) {
  const deck = CARD_DECKS.find((d) => d.id === deckId)!;
  const { masteredCardIds, goDeck } = useAppStore();
  const cards = deck.cardIds.map((id) => CARDS.find((c) => c.id === id)!).filter(Boolean);
  const masteredCount = cards.filter((c) => masteredCardIds.includes(c.id)).length;
  const progress = cards.length ? masteredCount / cards.length : 0;

  return (
    <Card variant="surface" className="border border-border p-5 flex flex-col gap-4">
      <button type="button" onClick={() => goDeck(deck.cardIds)} className="pressable flex items-center gap-4 text-left">
        <div className="relative w-12 h-12 flex-none flex items-center justify-center">
          <CircularProgress value={progress} size={48} thickness={4} />
          <div className="absolute text-[11px] font-semibold">{Math.round(progress * 100)}%</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[16.5px] font-semibold truncate">{deck.title}</div>
          <div className="text-meta mt-0.5">
            {cards.length} {plural(cards.length, 'чанк', 'чанка', 'чанков')} · {deck.level} · {deck.category}
          </div>
        </div>
      </button>

      <div className="flex flex-col">
        {cards.map((card) => {
          const mastered = masteredCardIds.includes(card.id);
          return (
            <div key={card.id} className="flex items-center gap-3 py-2 border-t border-border first:border-t-0">
              {mastered ? (
                <span className="flex-none w-5 h-5 rounded-full bg-positive text-white flex items-center justify-center">
                  <Check size={13} strokeWidth={3} />
                </span>
              ) : (
                <span className="flex-none w-5 h-5 rounded-full border-2 border-dashed border-border-strong" />
              )}
              <span className={`flex-1 text-[14.5px] truncate ${mastered ? 'text-text-secondary' : 'text-text'}`}>{card.en}</span>
              <span className="text-[13.5px] text-text-secondary truncate">{card.ru}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function CardsScreen() {
  const s = useAppStore();
  const [level, setLevel] = useState<CEFRLevel | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(CARD_DECKS.map((d) => d.category))), []);
  const levelsPresent = useMemo(() => new Set(CARD_DECKS.map((d) => d.level)), []);
  const decks = CARD_DECKS.filter((d) => (level ? d.level === level : true) && (category ? d.category === category : true));

  const masteredTotal = s.masteredCardIds.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title="Карточки" onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-7">
        <Card variant="accent" onClick={() => s.goDeck()} className="p-6 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-[20px] font-semibold leading-[27px]">Учить чанки</div>
            <div className="text-body-secondary mt-1">
              {masteredTotal}/{CARDS.length} выучено · вся коллекция вперемешку
            </div>
          </div>
          <div className="w-11 h-11 flex-none rounded-full bg-accent text-on-accent flex items-center justify-center">
            <Play size={17} fill="currentColor" />
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="text-section-title">Колоды</div>

          <div className="flex flex-col gap-2">
            <div className="text-meta">Сложность</div>
            <div className="flex gap-2 flex-wrap">
              <Chip selected={level === null} onClick={() => setLevel(null)}>
                Все
              </Chip>
              {LEVELS.filter((l) => levelsPresent.has(l)).map((l) => (
                <Chip key={l} selected={level === l} onClick={() => setLevel(l === level ? null : l)}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-meta">Тема</div>
            <div className="flex gap-2 flex-wrap">
              <Chip selected={category === null} onClick={() => setCategory(null)}>
                Все
              </Chip>
              {categories.map((c) => (
                <Chip key={c} selected={category === c} onClick={() => setCategory(c === category ? null : c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {decks.map((d) => (
            <DeckWidget key={d.id} deckId={d.id} />
          ))}
          {decks.length === 0 && <div className="text-body-secondary">Нет колод с таким фильтром.</div>}
        </div>
      </div>
    </div>
  );
}

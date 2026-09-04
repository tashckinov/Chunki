import { useEffect, useMemo, useState } from 'react';
import { Play, Check } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { flattenChunks, type CollectionDetail } from '../lib/collections';
import { plural } from '../lib/plural';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CircularProgress } from '../components/ui/Progress';
import { Chip } from '../components/ui/Chip';

// The backend's plain CEFR set (collections.level / chunks.level) — not the
// richer CEFRLevel from @app/shared used elsewhere for the placement test.
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function DeckWidget({ detail }: { detail: CollectionDetail }) {
  const { masteredCardIds, goDeck } = useAppStore();
  const masteredCount = detail.chunks.filter((c) => masteredCardIds.includes(c.id)).length;
  const progress = detail.chunks.length ? masteredCount / detail.chunks.length : 0;

  return (
    <Card variant="surface" className="border border-border p-5 flex flex-col gap-4">
      <button type="button" onClick={() => goDeck(detail.chunks)} className="pressable flex items-center gap-4 text-left">
        <div className="relative w-12 h-12 flex-none flex items-center justify-center">
          <CircularProgress value={progress} size={48} thickness={4} />
          <div className="absolute text-[11px] font-semibold">{Math.round(progress * 100)}%</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[16.5px] font-semibold truncate">{detail.title}</div>
          <div className="text-meta mt-0.5">
            {detail.chunks.length} {plural(detail.chunks.length, 'чанк', 'чанка', 'чанков')} · {detail.level}
          </div>
        </div>
      </button>

      <div className="flex flex-col">
        {detail.chunks.map((chunk) => {
          const mastered = masteredCardIds.includes(chunk.id);
          return (
            <div key={chunk.id} className="flex items-center gap-3 py-2 border-t border-border first:border-t-0">
              {mastered ? (
                <span className="flex-none w-5 h-5 rounded-full bg-positive text-white flex items-center justify-center">
                  <Check size={13} strokeWidth={3} />
                </span>
              ) : (
                <span className="flex-none w-5 h-5 rounded-full border-2 border-dashed border-border-strong" />
              )}
              <span className={`flex-1 text-[14.5px] truncate ${mastered ? 'text-text-secondary' : 'text-text'}`}>{chunk.text}</span>
              <span className="text-[13.5px] text-text-secondary truncate">{chunk.translation}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function CardsScreen() {
  const s = useAppStore();
  const [level, setLevel] = useState<string | null>(null);

  useEffect(() => {
    s.loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const details = useMemo(() => Object.values(s.collectionDetails), [s.collectionDetails]);
  const allChunks = useMemo(() => flattenChunks(details), [details]);
  const levelsPresent = useMemo(() => new Set(s.collections.map((c) => c.level)), [s.collections]);
  const visibleCollections = level ? s.collections.filter((c) => c.level === level) : s.collections;

  const masteredTotal = s.masteredCardIds.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title="Карточки" onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-7">
        {s.collectionsStatus === 'error' && s.collectionsError === 'unauthorized' && (
          <Card variant="surface" className="border border-border p-6 flex flex-col gap-3">
            <div className="text-[16px] font-semibold">Войдите, чтобы увидеть карточки</div>
            <div className="text-body-secondary">Колоды и чанки загружаются с сервера — нужен аккаунт Google.</div>
            <Button onClick={s.signIn} className="self-start">
              Войти через Google
            </Button>
          </Card>
        )}

        {s.collectionsStatus === 'error' && s.collectionsError === 'error' && (
          <Card variant="surface" className="border border-border p-6 flex flex-col gap-3">
            <div className="text-[16px] font-semibold">Не получилось загрузить карточки</div>
            <Button variant="secondary" onClick={s.loadCollections} className="self-start">
              Попробовать снова
            </Button>
          </Card>
        )}

        {(s.collectionsStatus === 'idle' || s.collectionsStatus === 'loading') && (
          <div className="text-body-secondary">Загрузка…</div>
        )}

        {s.collectionsStatus === 'loaded' && (
          <>
            <Card variant="accent" onClick={() => s.goDeck(allChunks)} className="p-6 flex items-center gap-4">
              <div className="flex-1">
                <div className="text-[20px] font-semibold leading-[27px]">Учить чанки</div>
                <div className="text-body-secondary mt-1">
                  {masteredTotal}/{allChunks.length} выучено · вся коллекция вперемешку
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
            </div>

            <div className="flex flex-col gap-4">
              {visibleCollections.map((c) => {
                const detail = s.collectionDetails[c.slug];
                return detail ? <DeckWidget key={c.id} detail={detail} /> : null;
              })}
              {visibleCollections.length === 0 && <div className="text-body-secondary">Нет колод с таким фильтром.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

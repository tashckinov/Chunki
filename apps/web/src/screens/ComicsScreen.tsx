import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { fetchComicCollections, fetchCollectionComics, type ComicCollection, type ComicSummary } from '../lib/collections';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Button } from '../components/ui/Button';
import { plural } from '../lib/plural';

const row = 'pressable w-full rounded-xl border border-border bg-surface p-4 text-left disabled:opacity-60';

function CollectionComics({ collection }: { collection: ComicCollection }) {
  const openDialogue = useAppStore((s) => s.openDialogueFromBrowse);
  const [comics, setComics] = useState<ComicSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [comicError, setComicError] = useState(false);
  const pendingOpen = useRef<AbortController | null>(null);
  useEffect(() => () => pendingOpen.current?.abort(), []);

  useEffect(() => {
    let active = true;
    fetchCollectionComics(collection.slug, offset).then((page) => {
      if (!active) return;
      setComics((current) => offset === 0 ? page.comics : [...current, ...page.comics.filter(({ id }) => !current.some((item) => item.id === id))]);
      setNext(page.nextOffset);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [collection.slug, offset, retry]);

  async function open(comic: ComicSummary) {
    const request = new AbortController();
    pendingOpen.current = request;
    setOpening(comic.id);
    setComicError(false);
    try {
      await openDialogue(comic.id, comic.text, request.signal);
      if (useAppStore.getState().screen === 'comics') setComicError(true);
    } catch {
      setComicError(true);
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {comics.map((comic) => (
        <button key={comic.id} type="button" className={row} disabled={opening !== null} onClick={() => void open(comic)}>
          <span className="block font-medium">{comic.text}</span>
          <span className="block text-meta">{opening === comic.id ? 'Открываем…' : comic.translation}</span>
        </button>
      ))}
      {comicError && <p role="alert" className="text-negative">Не удалось открыть комикс. Попробуйте ещё раз.</p>}
      {loading ? <p role="status" className="py-2 text-body-secondary">Загружаем комиксы…</p> : error ? (
        <Button variant="secondary" onClick={() => { setError(false); setLoading(true); setRetry((value) => value + 1); }}>
          Повторить загрузку
        </Button>
      ) : next !== null ? (
        <Button variant="secondary" onClick={() => { setLoading(true); setOffset(next); }}>Загрузить ещё</Button>
      ) : comics.length === 0 && <p className="text-body-secondary">В этой коллекции пока нет комиксов.</p>}
    </div>
  );
}

export function ComicsScreen() {
  const [collections, setCollections] = useState<ComicCollection[]>();
  const [selected, setSelected] = useState<ComicCollection>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    fetchComicCollections().then((items) => { if (active) setCollections(items); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBar size="large" title={selected?.title ?? 'Комиксы'} onBack={selected ? () => setSelected(undefined) : undefined} />
      <div key={selected?.slug ?? 'index'} className="scroll-clean flex min-h-0 flex-1 flex-col gap-2 px-5 pb-8">
        {selected ? <CollectionComics collection={selected} /> : (
          <>
            {error && <Button variant="secondary" onClick={() => { setError(false); setRetry((value) => value + 1); }}>Повторить загрузку коллекций</Button>}
            {!collections && !error && <p role="status" className="text-body-secondary">Загружаем коллекции…</p>}
            {collections?.length === 0 && <p className="text-body-secondary">Пока нет коллекций с комиксами.</p>}
            {collections?.map((collection) => (
              <button key={collection.slug} type="button" className={`${row} flex items-center justify-between gap-3`} onClick={() => setSelected(collection)}>
                <span className="min-w-0">
                  <span className="block font-medium">{collection.title}</span>
                  <span className="block text-meta">{collection.level} · {collection.count} {plural(collection.count, 'комикс', 'комикса', 'комиксов')}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function ComicsScreen() {
  const s = useAppStore();
  const [openingChunkId, setOpeningChunkId] = useState<string | null>(null);

  useEffect(() => {
    s.loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const details = useMemo(() => Object.values(s.collectionDetails), [s.collectionDetails]);
  const groups = useMemo(
    () =>
      details
        .map((detail) => ({ detail, chunks: detail.chunks.filter((c) => c.hasDialogue) }))
        .filter((g) => g.chunks.length > 0),
    [details],
  );

  async function open(chunkId: string) {
    setOpeningChunkId(chunkId);
    await s.openDialogueFromBrowse(chunkId);
    setOpeningChunkId(null);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title="Комиксы" onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-6">
        {s.collectionsStatus === 'error' && s.collectionsError === 'unauthorized' && (
          <Card variant="surface" className="border border-border p-6 flex flex-col gap-3">
            <div className="text-[16px] font-semibold">Войдите, чтобы увидеть комиксы</div>
            <div className="text-body-secondary">Диалоги загружаются с сервера — нужен аккаунт Google.</div>
            <Button onClick={s.signIn} className="self-start">
              Войти через Google
            </Button>
          </Card>
        )}

        {s.collectionsStatus === 'error' && s.collectionsError === 'error' && (
          <Card variant="surface" className="border border-border p-6 flex flex-col gap-3">
            <div className="text-[16px] font-semibold">Не получилось загрузить комиксы</div>
            <Button variant="secondary" onClick={s.loadCollections} className="self-start">
              Попробовать снова
            </Button>
          </Card>
        )}

        {(s.collectionsStatus === 'idle' || s.collectionsStatus === 'loading') && (
          <div className="text-body-secondary">Загрузка…</div>
        )}

        {s.collectionsStatus === 'loaded' && groups.length === 0 && (
          <div className="text-body-secondary">Пока нет комиксов — они появляются у чанков с диалогами.</div>
        )}

        {s.collectionsStatus === 'loaded' &&
          groups.map(({ detail, chunks }) => (
            <div key={detail.id} className="flex flex-col gap-2">
              <div className="text-section-title">{detail.title}</div>
              <div className="flex flex-col gap-2">
                {chunks.map((chunk) => (
                  <button
                    key={chunk.id}
                    type="button"
                    disabled={openingChunkId === chunk.id}
                    onClick={() => open(chunk.id)}
                    className="pressable flex flex-col gap-0.5 rounded-[var(--radius-md)] border border-border p-4 text-left disabled:opacity-60"
                  >
                    <div className="text-[14.5px] font-medium">{chunk.text}</div>
                    <div className="text-meta">{chunk.translation}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

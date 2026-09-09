import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Dialog } from '../components/ui/Dialog';
import { Switch } from '../components/ui/Switch';
import { IconButton } from '../components/ui/IconButton';
import {
  fetchAdminUsers,
  setUserPremiumUntil,
  fetchAdminCollections,
  createAdminCollection,
  updateAdminCollection,
  fetchAdminChunks,
  createAdminChunk,
  updateAdminChunk,
  deleteAdminChunk,
  removeChunkFromCollection,
  type AdminUser,
  type AdminCollection,
  type AdminChunk,
  type NewChunkInput,
} from '../lib/admin';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

function LevelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full box-border rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3 text-body outline-none"
    >
      {LEVELS.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isPremiumActive(premiumUntil: string | null): boolean {
  return !!premiumUntil && new Date(premiumUntil).getTime() > Date.now();
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => setError('Не удалось загрузить пользователей.'));
  }, []);

  async function apply(userId: string, premiumUntil: string | null) {
    setBusyId(userId);
    setError(null);
    try {
      const updated = await setUserPremiumUntil(userId, premiumUntil);
      setUsers((prev) => prev?.map((u) => (u.id === userId ? updated : u)) ?? prev);
    } catch {
      setError('Не удалось обновить подписку.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div className="px-5 py-4 text-negative">{error}</div>;
  if (!users) return <div className="px-5 py-4 text-body-secondary">Загрузка…</div>;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {users.length === 0 && <div className="text-body-secondary">Пользователей пока нет.</div>}
      {users.map((u) => (
        <div key={u.id} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[14.5px] font-medium truncate">{u.displayName || u.email || u.id}</div>
              {u.email && <div className="text-meta truncate">{u.email}</div>}
            </div>
            {isPremiumActive(u.premiumUntil) && (
              <span className="flex-none text-[12px] font-medium text-accent bg-accent-subtle rounded-full px-2.5 py-1">Premium</span>
            )}
          </div>
          <div className="text-meta">
            Регистрация: {formatDate(u.createdAt)} · Последний вход: {formatDate(u.lastLoginAt)}
          </div>
          <div className="text-[13.5px]">
            Подписка до: <span className="font-medium">{formatDate(u.premiumUntil)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => apply(u.id, addDaysIso(30))}>
              +30 дней
            </Button>
            <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => apply(u.id, addDaysIso(365))}>
              +365 дней
            </Button>
            <Button size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => apply(u.id, null)}>
              Отменить
            </Button>
            <input
              type="date"
              value={customDate[u.id] ?? ''}
              onChange={(e) => setCustomDate((prev) => ({ ...prev, [u.id]: e.target.value }))}
              className="rounded-[var(--radius-md)] bg-surface-subtle px-3 py-2 text-[13.5px] outline-none"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busyId === u.id || !customDate[u.id]}
              onClick={() => apply(u.id, new Date(customDate[u.id]).toISOString())}
            >
              Задать дату
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChunkFormValue {
  text: string;
  translation: string;
  explanation: string;
  example: string;
  exampleTranslation: string;
  level: string;
  situationPrompt: string;
}

const EMPTY_CHUNK_FORM: ChunkFormValue = { text: '', translation: '', explanation: '', example: '', exampleTranslation: '', level: 'A2', situationPrompt: '' };

function chunkToForm(chunk: AdminChunk): ChunkFormValue {
  return {
    text: chunk.text,
    translation: chunk.translation,
    explanation: chunk.explanation ?? '',
    example: chunk.example ?? '',
    exampleTranslation: chunk.exampleTranslation ?? '',
    level: chunk.level,
    situationPrompt: chunk.situationPrompt ?? '',
  };
}

function formToChunkInput(v: ChunkFormValue): NewChunkInput {
  return {
    text: v.text.trim(),
    translation: v.translation.trim(),
    explanation: v.explanation.trim() || null,
    example: v.example.trim() || null,
    exampleTranslation: v.exampleTranslation.trim() || null,
    level: v.level,
    situationPrompt: v.situationPrompt.trim() || null,
  };
}

function ChunkFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ChunkFormValue | null;
  onSubmit: (value: ChunkFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<ChunkFormValue>(initial ?? EMPTY_CHUNK_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ?? EMPTY_CHUNK_FORM);
  }, [open, initial]);

  async function save() {
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      headline={initial ? 'Редактировать чанк' : 'Новый чанк'}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button size="sm" disabled={saving || !form.text.trim() || !form.translation.trim()} onClick={save}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
        <Input value={form.text} onChange={(v) => setForm((f) => ({ ...f, text: v }))} placeholder="Фраза (en)" />
        <Input value={form.translation} onChange={(v) => setForm((f) => ({ ...f, translation: v }))} placeholder="Перевод" />
        <Textarea value={form.explanation} onChange={(v) => setForm((f) => ({ ...f, explanation: v }))} placeholder="Пояснение" rows={2} />
        <Input value={form.example} onChange={(v) => setForm((f) => ({ ...f, example: v }))} placeholder="Пример (en)" />
        <Input value={form.exampleTranslation} onChange={(v) => setForm((f) => ({ ...f, exampleTranslation: v }))} placeholder="Перевод примера" />
        <LevelSelect value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: v }))} />
        <Textarea
          value={form.situationPrompt}
          onChange={(v) => setForm((f) => ({ ...f, situationPrompt: v }))}
          placeholder="Ситуация для продакшн-проверки (en, необязательно)"
          rows={3}
        />
      </div>
    </Dialog>
  );
}

interface CollectionFormValue {
  slug: string;
  title: string;
  description: string;
  level: string;
  position: string;
  isPublished: boolean;
}

const EMPTY_COLLECTION_FORM: CollectionFormValue = { slug: '', title: '', description: '', level: 'A2', position: '0', isPublished: false };

function collectionToForm(c: AdminCollection): CollectionFormValue {
  return { slug: c.slug, title: c.title, description: c.description ?? '', level: c.level, position: String(c.position), isPublished: c.isPublished };
}

function CollectionFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CollectionFormValue | null;
  onSubmit: (value: CollectionFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<CollectionFormValue>(initial ?? EMPTY_COLLECTION_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ?? EMPTY_COLLECTION_FORM);
  }, [open, initial]);

  async function save() {
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      headline={initial ? 'Редактировать коллекцию' : 'Новая коллекция'}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button size="sm" disabled={saving || !form.slug.trim() || !form.title.trim()} onClick={save}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="slug (travel-basics)" />
        <Input value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Название" />
        <Textarea value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Описание" rows={2} />
        <LevelSelect value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: v }))} />
        <Input value={form.position} onChange={(v) => setForm((f) => ({ ...f, position: v }))} placeholder="Позиция (число)" type="number" />
        <div className="flex items-center justify-between px-1">
          <span className="text-[14px]">Опубликована</span>
          <Switch checked={form.isPublished} onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
        </div>
      </div>
    </Dialog>
  );
}

function ContentTab() {
  const [collections, setCollections] = useState<AdminCollection[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<AdminChunk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chunkDialogChunk, setChunkDialogChunk] = useState<AdminChunk | 'new' | null>(null);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState<'new' | 'edit' | null>(null);

  useEffect(() => {
    fetchAdminCollections()
      .then((list) => {
        setCollections(list);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch(() => setError('Не удалось загрузить коллекции.'));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setChunks(null);
      return;
    }
    fetchAdminChunks(selectedId)
      .then(setChunks)
      .catch(() => setError('Не удалось загрузить чанки.'));
  }, [selectedId]);

  const selected = collections?.find((c) => c.id === selectedId) ?? null;

  function bumpChunkCount(delta: number) {
    setCollections((prev) => prev?.map((c) => (c.id === selectedId ? { ...c, chunkCount: Math.max(0, c.chunkCount + delta) } : c)) ?? prev);
  }

  async function handleCreateChunk(value: ChunkFormValue) {
    if (!selectedId) return;
    const chunk = await createAdminChunk(selectedId, formToChunkInput(value));
    setChunks((prev) => (prev ? [...prev, chunk] : [chunk]));
    bumpChunkCount(1);
  }

  async function handleUpdateChunk(id: string, value: ChunkFormValue) {
    const updated = await updateAdminChunk(id, formToChunkInput(value));
    setChunks((prev) => prev?.map((c) => (c.id === id ? { ...c, ...updated } : c)) ?? prev);
  }

  async function handleDeleteChunk(chunk: AdminChunk) {
    if (!window.confirm(`Удалить чанк «${chunk.text}» полностью, из всех коллекций?`)) return;
    await deleteAdminChunk(chunk.id);
    setChunks((prev) => prev?.filter((c) => c.id !== chunk.id) ?? prev);
    bumpChunkCount(-1);
  }

  async function handleDetachChunk(chunk: AdminChunk) {
    if (!selectedId) return;
    await removeChunkFromCollection(selectedId, chunk.id);
    setChunks((prev) => prev?.filter((c) => c.id !== chunk.id) ?? prev);
    bumpChunkCount(-1);
  }

  async function handleCreateCollection(value: CollectionFormValue) {
    const created = await createAdminCollection({
      slug: value.slug.trim(),
      title: value.title.trim(),
      description: value.description.trim() || null,
      level: value.level,
      position: Number(value.position) || 0,
      isPublished: value.isPublished,
    });
    setCollections((prev) => (prev ? [...prev, created] : [created]));
    setSelectedId(created.id);
  }

  async function handleUpdateCollection(value: CollectionFormValue) {
    if (!selectedId) return;
    const updated = await updateAdminCollection(selectedId, {
      slug: value.slug.trim(),
      title: value.title.trim(),
      description: value.description.trim() || null,
      level: value.level,
      position: Number(value.position) || 0,
      isPublished: value.isPublished,
    });
    setCollections((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
  }

  if (error) return <div className="px-5 py-4 text-negative">{error}</div>;
  if (!collections) return <div className="px-5 py-4 text-body-secondary">Загрузка…</div>;

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-center gap-2">
        <select
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="flex-1 min-w-0 rounded-[var(--radius-md)] bg-surface-subtle px-4 py-3 text-body outline-none"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} {c.isPublished ? '' : '(не опубликована)'} — {c.chunkCount}
            </option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={() => setCollectionDialogOpen('new')}>
          + Коллекция
        </Button>
      </div>

      {selected && (
        <div className="flex items-center justify-between text-meta">
          <span>
            /{selected.slug} · {selected.level} · позиция {selected.position}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setCollectionDialogOpen('edit')}>
            Изменить
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-[14.5px] font-medium">Чанки</div>
        <Button size="sm" variant="secondary" disabled={!selectedId} onClick={() => setChunkDialogChunk('new')}>
          + Чанк
        </Button>
      </div>

      <div className="flex flex-col">
        {chunks === null && <div className="text-body-secondary py-2">Загрузка…</div>}
        {chunks?.length === 0 && <div className="text-body-secondary py-2">В коллекции пока нет чанков.</div>}
        {chunks?.map((chunk) => (
          <div key={chunk.id} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] truncate">{chunk.text}</div>
              <div className="text-meta truncate">
                {chunk.translation} · {chunk.level}
                {chunk.situationPrompt ? ' · есть ситуация' : ''}
              </div>
            </div>
            <IconButton icon="Delete" label="Убрать из коллекции" size="sm" tone="muted" onClick={() => handleDetachChunk(chunk)} />
            <Button size="sm" variant="ghost" onClick={() => setChunkDialogChunk(chunk)}>
              Изменить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDeleteChunk(chunk)}>
              Удалить
            </Button>
          </div>
        ))}
      </div>

      <ChunkFormDialog
        open={chunkDialogChunk !== null}
        onOpenChange={(open) => !open && setChunkDialogChunk(null)}
        initial={chunkDialogChunk && chunkDialogChunk !== 'new' ? chunkToForm(chunkDialogChunk) : null}
        onSubmit={(value) => (chunkDialogChunk && chunkDialogChunk !== 'new' ? handleUpdateChunk(chunkDialogChunk.id, value) : handleCreateChunk(value))}
      />

      <CollectionFormDialog
        open={collectionDialogOpen !== null}
        onOpenChange={(open) => !open && setCollectionDialogOpen(null)}
        initial={collectionDialogOpen === 'edit' && selected ? collectionToForm(selected) : null}
        onSubmit={collectionDialogOpen === 'edit' ? handleUpdateCollection : handleCreateCollection}
      />
    </div>
  );
}

export function AdminScreen() {
  const user = useAppStore((s) => s.user);
  const back = useAppStore((s) => s.back);
  const goHome = useAppStore((s) => s.goHome);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (user && !user.isAdmin) goHome();
  }, [user, goHome]);

  if (!user?.isAdmin) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar size="large" title="Админка" onBack={back} hideBackOnDesktop />
      <div className="px-5 pb-2">
        <Tabs items={['Пользователи', 'Контент']} value={tab} onChange={setTab} />
      </div>
      <div className="scroll-clean flex-1 min-h-0">{tab === 0 ? <UsersTab /> : <ContentTab />}</div>
    </div>
  );
}

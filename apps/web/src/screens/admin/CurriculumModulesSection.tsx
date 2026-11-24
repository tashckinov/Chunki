import { useEffect, useState } from 'react';
import {
  CEFR_LEVELS, CURRICULUM_MODULE_TYPES, type CurriculumModule, type CurriculumModulePreview, type CurriculumTopic,
} from '@app/shared';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { NavigationBar } from '../../components/ui/NavigationBar';
import { fetchCurriculumTopics } from '../../lib/admin';
import { deleteJson, getJson, postJson } from '../../lib/collections';

const path = '/api/admin/curriculum-modules';
const labels = { core: 'Основной', supplementary: 'Дополнительный' };
const field = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm';
const blank: CurriculumModule = { id: '', title: '', description: '', level: 'A1', type: 'core', position: 10, topicIds: [] };

export function CurriculumModulesSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [modules, setModules] = useState<CurriculumModule[]>();
  const [topics, setTopics] = useState<CurriculumTopic[]>([]);
  const [draft, setDraft] = useState<CurriculumModule>();
  const [existing, setExisting] = useState(false);
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<CurriculumModulePreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getJson<{ modules: CurriculumModule[] }>(path), fetchCurriculumTopics()]).then(
      ([catalog, curriculum]) => {
        if (active) { setModules(catalog.modules); setTopics(curriculum); }
      },
      () => { if (active) setError('Не удалось загрузить модули и темы.'); },
    );
    return () => { active = false; };
  }, [refresh]);

  function open(module?: CurriculumModule) {
    setDraft(module ?? blank);
    setExisting(!!module);
    setError('');
    setStatus('');
  }

  async function submit(payload: unknown, mode: 'preview' | 'apply', manual = false) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await postJson<CurriculumModulePreview>(path + '/import?mode=' + (manual && !existing ? 'create' : mode), payload);
      if (!manual) setPreview(result);
      if (manual && result.issues.length) setError(result.issues.join('\n'));
      if (mode === 'apply' && !result.issues.length) {
        setStatus(manual ? 'Модуль сохранён.' : 'Импортировано модулей: ' + result.changes.length);
        setPreview(undefined);
        if (manual) setDraft(undefined);
        setRefresh((count) => count + 1);
      }
    } catch {
      setError('Не удалось обработать модули. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  function importJson(mode: 'preview' | 'apply') {
    setPreview(undefined);
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      setError('Некорректный JSON. Проверьте формат файла.');
      return;
    }
    void submit(payload, mode);
  }

  async function remove(module: CurriculumModule) {
    if (!window.confirm('Удалить модуль «' + module.title + '»?')) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await deleteJson(path + '/' + encodeURIComponent(module.id));
      setDraft(undefined);
      setStatus('Модуль удалён.');
      setRefresh((count) => count + 1);
    } catch {
      setError('Не удалось удалить модуль.');
    } finally {
      setBusy(false);
    }
  }

  const eligibleTopics = draft ? topics.filter((topic) => topic.level.replace('+', '') === draft.level.replace('+', '')) : [];
  const titles = new Map(topics.map((topic) => [topic.id, topic.title]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavigationBar title="Учебные модули" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
      <div className="scroll-clean flex-1 min-h-0">
        <main className="mx-auto max-w-3xl space-y-5 px-5 pb-6">
          {error && <p role="alert" className="whitespace-pre-wrap text-negative">{error}</p>}
          {status && <p role="status" className="text-positive">{status}</p>}
          {!modules && (error
            ? <Button size="sm" onClick={() => { setError(''); setRefresh((count) => count + 1); }}>Повторить загрузку</Button>
            : <p role="status" className="text-meta">Загружаем модули…</p>)}
          {modules && (
            <>
              <div className="flex justify-between gap-2">
                <h2 className="text-section-title">Модули</h2>
                <Button size="sm" disabled={busy} onClick={() => open()}>Создать модуль</Button>
              </div>
              {draft && (
                <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={(event) => { event.preventDefault(); void submit({ modules: [draft] }, 'apply', true); }}>
                  <h3 className="font-semibold">{existing ? 'Редактирование модуля' : 'Новый модуль'}</h3>
                  <fieldset className="space-y-3" disabled={busy}>
                    <label className="block text-meta">ID<input className={field} required readOnly={existing} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={72} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} /></label>
                    <label className="block text-meta">Название<input className={field} required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
                    <label className="block text-meta">Описание<textarea className={field} required maxLength={2000} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="block text-meta">Уровень CEFR<select className={field} value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as CurriculumModule['level'] })}>{CEFR_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
                      <label className="block text-meta">Тип<select className={field} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CurriculumModule['type'] })}>{CURRICULUM_MODULE_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
                      <label className="block text-meta">Порядок<input className={field} type="number" min={0} max={2147483647} required value={Number.isFinite(draft.position) ? draft.position : ''} onChange={(e) => setDraft({ ...draft, position: e.target.valueAsNumber })} /></label>
                    </div>
                    <label className="block text-meta">Добавить тему
                      <select className={field} value="" onChange={(e) => { if (e.target.value) setDraft({ ...draft, topicIds: [...draft.topicIds, e.target.value] }); }}>
                        <option value="">Выберите тему</option>
                        {eligibleTopics.filter(({ id }) => !draft.topicIds.includes(id)).map(({ id, title }) => <option key={id} value={id}>{title} · {id}</option>)}
                      </select>
                    </label>
                    <ol className="divide-y divide-border">
                      {draft.topicIds.map((id, index) => (
                        <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0 wrap-anywhere text-sm">{index + 1}. {titles.get(id) ?? id}</span>
                          <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, topicIds: draft.topicIds.filter((selected) => selected !== id) })}>Убрать</Button>
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" type="submit" disabled={draft.topicIds.length === 0 || (!existing && modules.some(({ id }) => id === draft.id))}>Сохранить</Button>
                      <Button size="sm" variant="secondary" onClick={() => setDraft(undefined)}>Отмена</Button>
                      {existing && <Button size="sm" variant="ghost" onClick={() => void remove(draft)}>Удалить модуль</Button>}
                    </div>
                    {!existing && modules.some(({ id }) => id === draft.id) && <p className="text-meta">Этот ID уже используется.</p>}
                  </fieldset>
                </form>
              )}
              {modules.length === 0 && <p className="text-meta">Учебных модулей пока нет.</p>}
              <ul className="divide-y divide-border">
                {modules.map((module) => (
                  <li key={module.id} className="flex items-start justify-between gap-2 py-3">
                    <div className="min-w-0 wrap-anywhere">
                      <p className="font-medium">{module.title}</p>
                      <p className="text-meta">{module.level} · {labels[module.type]} · порядок {module.position} · тем {module.topicIds.length}</p>
                    </div>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => open(module)}>Редактировать</Button>
                  </li>
                ))}
              </ul>
              <section className="space-y-3 border-t border-border pt-4">
                <h2 className="text-section-title">Импорт JSON</h2>
                <p className="text-meta">По совпадающему ID импорт заменит модуль и его список тем.</p>
                <label className="block text-meta">JSON модулей<textarea className={field + ' font-mono'} rows={8} value={json} disabled={busy}
                  onChange={(e) => { setJson(e.target.value); setPreview(undefined); setError(''); }} /></label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy || !json.trim()} onClick={() => importJson('preview')}>Проверить JSON</Button>
                  {preview && preview.issues.length === 0 && <Button size="sm" disabled={busy} onClick={() => importJson('apply')}>Импортировать</Button>}
                </div>
                {preview && (preview.issues.length ? (
                  <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-negative">
                    {preview.issues.map((issue, index) => <li key={index}>{issue}</li>)}
                  </ul>
                ) : (
                  <ul aria-label="Результат проверки" className="divide-y divide-border text-sm">
                    {preview.changes.map((change) => <li key={change.id} className="py-2">
                      {change.action === 'create' ? 'Будет создан' : 'Будет обновлён'} · {change.title} · тем {change.topics}
                    </li>)}
                  </ul>
                ))}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

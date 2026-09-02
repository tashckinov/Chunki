import { useAppStore } from '../store/appStore';
import { extraListView } from '../store/derived';
import { plural } from '../lib/plural';
import { TopAppBar } from '../components/ui/TopAppBar';
import { Switch } from '../components/ui/Switch';
import { IconButton } from '../components/ui/IconButton';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { EXTRA_TOPIC_DEFS } from '@app/shared';

export function ExtrasScreen() {
  const s = useAppStore();
  const list = extraListView(s.extrasEnabled, s.extrasRemoved);
  const onCount = list.filter((e) => e.on).length;
  const pending = s.confirmRemoveKey ? EXTRA_TOPIC_DEFS.find((e) => e.key === s.confirmRemoveKey) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <TopAppBar size="medium" title="Доп. уроки" onBack={s.back} />
      <div className="scroll-clean flex-1 min-h-0 px-6 pt-2 pb-6 flex flex-col gap-4">
        <div className="text-sm leading-5 tracking-[0.25px] text-on-surface-variant">
          Ваши слабые темы — их стоит подтянуть. Включённые встают в расписание между основными темами.
        </div>
        <div className="flex flex-col gap-2.5">
          {list.map((e) => (
            <div key={e.key} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl" style={{ border: `1px solid ${e.border}`, background: e.bg }}>
              <div className="flex-1">
                <div className="text-base leading-[22px]">{e.title}</div>
              </div>
              <Switch checked={e.on} onChange={() => s.toggleExtra(e.key)} />
              <IconButton icon="Delete" label="Удалить тему" onClick={() => s.requestRemoveExtra(e.key)} />
            </div>
          ))}
          {list.length === 0 && <div className="text-sm text-on-surface-variant">Слабых тем пока нет.</div>}
        </div>
        <div className="p-4 rounded-xl bg-secondary-container text-on-secondary-container text-[15px] leading-[22px] tracking-[0.25px]">
          {onCount} {plural(onCount, 'доп. урок встанет', 'доп. урока встанут', 'доп. уроков встанут')} между основными темами —
          программа удлинится на {onCount} {plural(onCount, 'занятие', 'занятия', 'занятий')}.
        </div>
        <Button variant="filled" size="m" onClick={s.goHome} className="w-full h-14">
          Вставить в расписание
        </Button>
      </div>

      {pending && (
        <Dialog
          headline={`Удалить «${pending.title}»?`}
          actions={
            <>
              <Button variant="text" size="s" onClick={s.cancelRemove}>
                Отмена
              </Button>
              <Button variant="text" size="s" onClick={s.confirmRemoveNow}>
                Удалить
              </Button>
            </>
          }
        >
          Тема исчезнет из доп. уроков и из расписания. Она вернётся, если ошибки повторятся в следующих проверках.
        </Dialog>
      )}
    </div>
  );
}

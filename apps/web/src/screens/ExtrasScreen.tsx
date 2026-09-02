import { EXTRA_TOPIC_DEFS } from '@app/shared';
import { useAppStore } from '../store/appStore';
import { extraListView } from '../store/derived';
import { plural } from '../lib/plural';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Switch } from '../components/ui/Switch';
import { IconButton } from '../components/ui/IconButton';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';

export function ExtrasScreen() {
  const s = useAppStore();
  const list = extraListView(s.extrasEnabled, s.extrasRemoved);
  const onCount = list.filter((e) => e.on).length;
  const pending = s.confirmRemoveKey ? EXTRA_TOPIC_DEFS.find((e) => e.key === s.confirmRemoveKey) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <NavigationBar size="large" title="Доп. уроки" onBack={s.back} hideBackOnDesktop />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-6 flex flex-col gap-6">
        <div className="text-body-secondary">Ваши слабые темы — их стоит подтянуть. Включённые встают в расписание между основными темами.</div>
        <div className="flex flex-col">
          {list.map((e) => (
            <div key={e.key} className="flex items-center gap-3.5 py-3.5 border-b border-border last:border-b-0">
              <div className="flex-1 text-[15.5px]">{e.title}</div>
              <Switch checked={e.on} onChange={() => s.toggleExtra(e.key)} />
              <IconButton icon="Delete" label="Удалить тему" size="sm" tone="muted" onClick={() => s.requestRemoveExtra(e.key)} />
            </div>
          ))}
          {list.length === 0 && <div className="text-body-secondary py-2">Слабых тем пока нет.</div>}
        </div>
        <div className="text-body-secondary border-t border-border pt-6">
          {onCount} {plural(onCount, 'доп. урок встанет', 'доп. урока встанут', 'доп. уроков встанут')} между основными темами — программа
          удлинится на {onCount} {plural(onCount, 'занятие', 'занятия', 'занятий')}.
        </div>
        <Button size="lg" onClick={s.goHome} className="w-full">
          Вставить в расписание
        </Button>
      </div>

      <Dialog
        open={!!pending}
        onOpenChange={(open) => !open && s.cancelRemove()}
        headline={pending ? `Удалить «${pending.title}»?` : ''}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={s.cancelRemove}>
              Отмена
            </Button>
            <Button variant="ghost" size="sm" onClick={s.confirmRemoveNow}>
              Удалить
            </Button>
          </>
        }
      >
        Тема исчезнет из доп. уроков и из расписания. Она вернётся, если ошибки повторятся в следующих проверках.
      </Dialog>
    </div>
  );
}

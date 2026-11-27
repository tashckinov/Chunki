import { track } from '../../lib/productAnalytics';
import { useAppStore } from '../../store/appStore';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { getJson, postJson } from '../../lib/collections';
import { DAY_LABELS } from '../../lib/schedule';
import { Button } from './Button';

const DEFAULT_TIME = '19:00';
const DEFAULT_DAYS = [0, 1, 2, 3, 4];
const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

interface StudyReminderProps {
  studyDays?: number[];
  onStudyDaysChange?: (days: number[]) => void;
  finishSchedule?: () => Promise<void>;
}

function supportsReminders() {
  return window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
}

export function StudyReminderSetting({ studyDays, onStudyDaysChange, finishSchedule }: StudyReminderProps) {
  const [publicKey, setPublicKey] = useState<string | null>();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [deviceDays, setDeviceDays] = useState(DEFAULT_DAYS);
  const days = studyDays ?? deviceDays;
  const [saved, setSaved] = useState({ time: DEFAULT_TIME, days: DEFAULT_DAYS });
  const dirty = time !== saved.time || days.length !== saved.days.length || days.some((day) => !saved.days.includes(day));
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState('');
  const supported = supportsReminders();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    async function load() {
      try {
        const [{ publicKey: key }, registration] = await Promise.all([
          getJson<{ publicKey: string | null }>('/api/reminders/config'),
          navigator.serviceWorker.getRegistration(),
        ]);
        const current = await registration?.pushManager.getSubscription() ?? null;
        const status = current
          ? await postJson<{ time: string | null; days: number[] | null }>('/api/reminders/status', { endpoint: current.endpoint })
          : { time: null, days: null };
        if (!active) return;
        setPublicKey(key);
        setSubscription(current);
        if (status.time) {
          setTime(status.time);
          const loadedDays = status.days ?? DEFAULT_DAYS;
          setDeviceDays(loadedDays);
          onStudyDaysChange?.(loadedDays);
          setSaved({ time: status.time, days: loadedDays });
          setEnabled(true);
        }
      } catch {
        if (active) {
          setPublicKey(null);
          setMessage('Не удалось загрузить настройки напоминаний.');
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [supported, onStudyDaysChange]);

  async function save(nextEnabled: boolean): Promise<boolean> {
    if (busy || (nextEnabled && (!publicKey || !time || !days.length))) return false;
    setBusy(true);
    setMessage('');
    try {
      if (!nextEnabled && subscription) {
        await postJson('/api/reminders/disable', { endpoint: subscription.endpoint });
        setEnabled(false);
      } else if (nextEnabled && publicKey) {
        // Ask immediately from the checkbox gesture; Safari blocks prompts after an async network call.
        const shouldAsk = Notification.permission === 'default';
        const user = useAppStore.getState().user?.id;
        const permission = shouldAsk ? await Notification.requestPermission() : Notification.permission;
        if (shouldAsk && permission !== 'default') {
          track(user, permission === 'granted' ? 'notification_permission_granted' : 'notification_permission_denied');
        }
        if (permission !== 'granted') {
          setMessage('Разрешите уведомления для Chunki в настройках браузера или устройства.');
          return false;
        }
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration?.active) {
          setMessage('Обновите приложение, затем попробуйте включить напоминания ещё раз.');
          return false;
        }
        const current = await registration.pushManager.getSubscription()
          ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
        const data = current.toJSON();
        await postJson('/api/reminders', {
          endpoint: current.endpoint,
          keys: data.keys,
          time,
          days,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setSubscription(current);
        setSaved({ time, days });
        setEnabled(true);
      }
      return true;
    } catch {
      setMessage('Не удалось сохранить напоминания. Попробуйте ещё раз.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!finishSchedule) return;
    setFinishing(true);
    try {
      if (!enabled || !dirty || await save(true)) await finishSchedule();
    } finally {
      setFinishing(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-border bg-surface p-3.5">
        <label className="flex items-center gap-2.5 text-[14px] font-medium">
          <Bell size={17} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="flex-1">Хочу получать напоминания</span>
          <input type="checkbox" checked={enabled} disabled={busy || finishing || (!enabled && (!publicKey || !time || !days.length))}
            className="h-5 w-5 shrink-0 accent-accent" onChange={(event) => void save(event.target.checked)} />
        </label>
        <fieldset className="mt-3" disabled={busy || finishing || (!studyDays && !publicKey)}>
          <legend className="mb-1.5 text-meta">Дни занятий</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => {
              const selected = days.includes(day);
              return <button key={day} type="button" aria-label={WEEKDAYS[day]} aria-pressed={selected}
                disabled={selected && days.length === 1}
                className={`pressable min-h-9 min-w-9 rounded-full px-2 text-sm font-medium ${selected ? 'bg-accent text-on-accent' : 'bg-surface-subtle text-text'}`}
                onClick={() => {
                  const next = selected ? days.filter((value) => value !== day) : [...days, day].sort();
                  if (onStudyDaysChange) onStudyDaysChange(next);
                  else setDeviceDays(next);
                }}>{label}</button>;
            })}
          </div>
        </fieldset>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-meta">
            Время
            <input type="time" value={time} required={enabled} disabled={busy || finishing || !publicKey}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] text-text"
              onChange={(event) => setTime(event.target.value)} />
          </label>
          {!finishSchedule && enabled && dirty && (
            <Button size="sm" variant="secondary" disabled={busy || finishing || !time || !days.length} onClick={() => void save(true)}>Сохранить расписание</Button>
          )}
        </div>
        <p className="mt-2 text-meta">
          {!supported ? 'Уведомления здесь недоступны. На iPhone или iPad откройте Chunki с экрана «Домой».'
            : publicKey === null ? 'Напоминания пока недоступны.'
              : 'В выбранные дни по местному времени, если в плане осталось занятие. Настройка действует на этом устройстве.'}
        </p>
        {message && <p role="status" className="mt-2 text-[13px] text-negative">{message}</p>}
      </section>
      {finishSchedule && (
        <Button size="lg" onClick={() => void finish()} disabled={busy || finishing || (enabled && !time)} className="w-full">
          {finishing ? 'Сохраняем…' : 'Готово'}
        </Button>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { getJson, postJson } from '../../lib/collections';
import { Button } from './Button';

const DEFAULT_TIME = '19:00';

function supportsReminders() {
  return window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
}

export function StudyReminderSetting() {
  const [publicKey, setPublicKey] = useState<string | null>();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [savedTime, setSavedTime] = useState(DEFAULT_TIME);
  const [busy, setBusy] = useState(false);
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
          ? await postJson<{ time: string | null }>('/api/reminders/status', { endpoint: current.endpoint })
          : { time: null };
        if (!active) return;
        setPublicKey(key);
        setSubscription(current);
        if (status.time) {
          setTime(status.time);
          setSavedTime(status.time);
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
  }, [supported]);

  async function save(nextEnabled: boolean) {
    if (busy || (nextEnabled && (!publicKey || !time))) return;
    setBusy(true);
    setMessage('');
    try {
      if (!nextEnabled && subscription) {
        await postJson('/api/reminders/disable', { endpoint: subscription.endpoint });
        setEnabled(false);
      } else if (nextEnabled && publicKey) {
        // Ask immediately from the checkbox gesture; Safari blocks prompts after an async network call.
        const permission = Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
        if (permission !== 'granted') {
          setMessage('Разрешите уведомления для Chunki в настройках браузера или устройства.');
          return;
        }
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration?.active) {
          setMessage('Обновите приложение, затем попробуйте включить напоминания ещё раз.');
          return;
        }
        const current = await registration.pushManager.getSubscription()
          ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
        const data = current.toJSON();
        await postJson('/api/reminders', {
          endpoint: current.endpoint,
          keys: data.keys,
          time,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setSubscription(current);
        setSavedTime(time);
        setEnabled(true);
      }
    } catch {
      setMessage('Не удалось сохранить напоминания. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-3.5">
      <label className="flex items-center gap-2.5 text-[14px] font-medium">
        <Bell size={17} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="flex-1">Хочу получать напоминания</span>
        <input type="checkbox" checked={enabled} disabled={busy || (!enabled && (!publicKey || !time))}
          className="h-5 w-5 shrink-0 accent-accent" onChange={(event) => void save(event.target.checked)} />
      </label>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-meta">
          Время
          <input type="time" value={time} required={enabled} disabled={busy || !publicKey}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] text-text"
            onChange={(event) => setTime(event.target.value)} />
        </label>
        {enabled && time !== savedTime && (
          <Button size="sm" variant="secondary" disabled={busy || !time} onClick={() => void save(true)}>Сохранить время</Button>
        )}
      </div>
      <p className="mt-2 text-meta">
        {!supported ? 'Уведомления здесь недоступны. На iPhone или iPad откройте Chunki с экрана «Домой».'
          : publicKey === null ? 'Напоминания пока недоступны.'
            : 'По будням, по местному времени. Настройка действует на этом устройстве.'}
      </p>
      {message && <p role="status" className="mt-2 text-[13px] text-negative">{message}</p>}
    </section>
  );
}

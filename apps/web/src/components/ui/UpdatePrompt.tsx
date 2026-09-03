import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// GitHub Pages caches static assets for a while, and installed PWAs can sit
// open for days, so we don't just wait for the browser's own (rare, ~daily)
// update check — we ask the already-registered service worker to look for a
// new one right away, then again periodically and whenever the app regains
// focus.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let reloadOnControlChangeArmed = false;
function reloadWhenNewWorkerTakesControl() {
  if (reloadOnControlChangeArmed || !('serviceWorker' in navigator)) return;
  reloadOnControlChangeArmed = true;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

export function UpdatePrompt() {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      reloadWhenNewWorkerTakesControl();
      registration.update();
      setInterval(() => registration.update(), CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update();
      });
    },
  });

  if (!needRefresh) return null;

  const onUpdate = () => {
    setUpdating(true);
    updateServiceWorker(true);
    // Belt and suspenders: reload unconditionally shortly after, in case the
    // new worker never signals it took control. Worst case is one harmless
    // extra reload instead of a button that silently does nothing.
    setTimeout(() => window.location.reload(), 3000);
  };

  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4 bottom-[calc(80px+env(safe-area-inset-bottom))] min-[1200px]:bottom-5">
      <div className="w-full max-w-[420px] rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-md)] border border-border px-4 py-3.5 flex items-center gap-3 anim-rise">
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold">Вышло обновление</div>
          <div className="text-meta mt-0.5">Обновите, чтобы получить последние изменения</div>
        </div>
        <button
          type="button"
          onClick={onUpdate}
          disabled={updating}
          className="pressable flex-none rounded-[var(--radius-md)] bg-accent text-on-accent text-[13.5px] font-semibold px-4 py-2 disabled:opacity-60"
        >
          {updating ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>
    </div>
  );
}

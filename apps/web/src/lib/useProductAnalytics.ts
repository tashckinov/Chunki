import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { flushEvents, reportNotificationClick, track } from './productAnalytics';

export function useProductAnalytics(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const current = () => useAppStore.getState().user?.id === userId;
    const clickKey = `chunki-pending-notification-click:${userId}`;
    let memoryClick: string | null = null;
    const pendingClick = () => {
      try { return sessionStorage.getItem(clickKey) ?? memoryClick; } catch { return memoryClick; }
    };
    const rememberClick = (id: unknown) => {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return;
      memoryClick = id;
      try { sessionStorage.setItem(clickKey, id); } catch { /* Memory only. */ }
    };
    let sendingClick = false;
    const flush = () => {
      void flushEvents(userId, current);
      const click = pendingClick();
      if (!click || sendingClick || !current()) return;
      sendingClick = true;
      void reportNotificationClick(click).then(() => {
        if (pendingClick() !== click) return;
        memoryClick = null;
        try { sessionStorage.removeItem(clickKey); } catch { /* Memory only. */ }
      }).catch(() => {}).finally(() => { sendingClick = false; });
    };
    const onNotification = (event: MessageEvent) => {
      if (event.data?.type !== 'chunki-notification-click') return;
      rememberClick(event.data.id);
      flush();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useAppStore.getState().screen !== 'admin') {
        track(userId, 'app_opened');
        flush();
      }
    };
    const url = new URL(window.location.href);
    if (url.searchParams.has('reminder')) {
      rememberClick(url.searchParams.get('reminder'));
      url.searchParams.delete('reminder');
      history.replaceState(history.state, '', url);
    }
    const onScreen = (state: ReturnType<typeof useAppStore.getState>, previous?: ReturnType<typeof useAppStore.getState>) => {
      if (!current() || state.screen === 'admin') return;
      if (state.screen === 'program' && previous?.screen !== 'program') track(userId, 'program_opened');
      if (state.screen === 'deck' && state.analyticsDeckId &&
        (state.analyticsDeckId !== previous?.analyticsDeckId || state.deckIndex !== previous.deckIndex)) {
        const contentId = state.activeDeckChunks[state.deckIndex]?.id;
        if (contentId) track(userId, 'card_viewed', { contentId, journeyId: state.analyticsDeckId });
      }
      if (state.screen !== previous?.screen) flush();
    };
    if (useAppStore.getState().screen !== 'admin') onVisible();
    onScreen(useAppStore.getState());
    flush();
    const unsubscribe = useAppStore.subscribe(onScreen);
    const timer = window.setInterval(flush, 5000);
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onNotification);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onNotification);
    };
  }, [userId]);
}

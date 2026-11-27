import { useAppStore } from '../../store/appStore';
import { useEffect, useState } from 'react';
import { getJson } from '../../lib/collections';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { NavigationBar } from '../../components/ui/NavigationBar';

const labels: Record<string, string> = {
  app_opened: 'Открыл приложение', registered: 'Регистрация', placement_started: 'Начал тест уровня',
  placement_completed: 'Завершил тест уровня', placement_result_viewed: 'Открыл результат теста',
  program_prepared: 'Получил программу', program_opened: 'Открыл программу', topic_opened: 'Открыл тему',
  topic_study_started: 'Перешёл от урока к упражнениям', topic_check_started: 'Начал проверку по теме',
  topic_check_completed: 'Завершил проверку по теме', collection_opened: 'Открыл коллекцию',
  deck_started: 'Начал карточки', card_viewed: 'Увидел карточку', card_reviewed: 'Ответил по карточке',
  card_first_mastered: 'Впервые подтвердил карточку', deck_completed: 'Завершил карточки',
  comic_opened: 'Открыл комикс', comic_completed: 'Завершил комикс',
  reminder_enabled: 'Включил напоминания', reminder_disabled: 'Выключил напоминания',
  reminder_schedule_changed: 'Изменил расписание', notification_permission_granted: 'Разрешил уведомления',
  notification_permission_denied: 'Запретил уведомления', notification_send_attempted: 'Попытка отправки',
  notification_sent: 'Принято push-сервисом', notification_failed: 'Ошибка отправки', notification_clicked: 'Нажал уведомление',
};
const category: Record<string, string> = { topic: 'Темы', collection: 'Коллекции', card: 'Карточки', comic: 'Комиксы' };
const segments: Record<string, string> = { recommended: 'рекомендованная', independent: 'самостоятельно', self: 'самостоятельно',
  review: 'повторение', reconfirm: 'переподтверждение', initial: 'первая проверка', first: 'первый тест', retest: 'повторный тест',
  read: 'чтение', deck: 'из карточек', browse: 'из каталога' };
const zone = 'Europe/Moscow';
const formatTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone });
const ratio = (count: number, total: number) => total ? `${count} из ${total} · ${Math.round(100 * count / total)}%` : 'Нет выборки';
type Timeline = { rows: { event_id: string; name: string; user_id: string; email: string | null; occurred_at: string;
  title: string | null; content_id: string | null; source: string; properties: Record<string, unknown> }[]; more: boolean };
type Report = {
  totals: Record<string, number>;
  cohort: { total: number; started: number; tested: number; first_lesson: number; activated: number;
    retention: { day: number; eligible: number; returned: number }[] };
  events: { name: string; segment: string; events: number; users: number }[];
  content: { content_type: string; content_id: string; title: string; users: number; opens: number; actions: number; finishes: number; returning: number }[];
  delivery: Record<string, number>;
  adherence: { plans: number; finished: number };
  completion: { name: string; started: number; finished: number }[];
};
const tabs = ['Обзор', 'Обучение', 'Контент', 'Уведомления', 'Хронология'] as const;
type Tab = (typeof tabs)[number];

function Stats({ items }: { items: [string, string | number][] }) {
  return <dl className="grid gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
    {items.map(([title, value]) => <div key={title} className="flex justify-between gap-3 py-2 sm:border-b sm:border-border">
      <dt className="text-body-secondary">{title}</dt><dd className="font-semibold tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

export function AnalyticsSection({ onOpenMenu }: { onOpenMenu: () => void }) {
  const user = useAppStore((state) => state.analyticsUser);
  const [tab, setTab] = useState<Tab>(user ? 'Хронология' : 'Обзор');
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report>();
  const [timeline, setTimeline] = useState<Timeline>();
  const [filter, setFilter] = useState({ user: user ?? '', name: '', content: '' });
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const query = new URLSearchParams({ days: String(days), zone }).toString();
  const filters = new URLSearchParams({ ...filter, offset: String(offset) }).toString();
  const showingTimeline = tab === 'Хронология';
  useEffect(() => {
    let live = true;
    setError(false);
    if (showingTimeline) {
      setTimeline(undefined);
      void getJson<Timeline>(`/api/admin/analytics/activity?${query}&${filters}`).then(
        (value) => { if (live) setTimeline(value); }, () => { if (live) setError(true); },
      );
    } else {
      setReport(undefined);
      void getJson<Report>(`/api/admin/analytics?${query}`).then(
        (value) => { if (live) setReport(value); }, () => { if (live) setError(true); },
      );
    }
    return () => { live = false; };
  }, [showingTimeline, query, filters, retry]);

  return <div className="flex min-h-0 flex-1 flex-col">
    <NavigationBar title="Аналитика" leading={<IconButton icon="Menu" label="Меню" onClick={onOpenMenu} />} />
    <main className="scroll-clean min-h-0 flex-1 space-y-5 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Раздел аналитики">
          {tabs.map((item) => <Button key={item} size="sm" variant={tab === item ? 'primary' : 'ghost'}
            aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</Button>)}
        </div>
        <label className="text-meta">Период · Москва <select className="rounded-lg border border-border bg-surface p-2 text-text" value={days}
          onChange={(event) => { setDays(Number(event.target.value)); setOffset(0); }}>
          {[7, 30, 90, 365].map((value) => <option key={value} value={value}>{value} дней</option>)}
        </select></label>
      </div>
      {error && <div role="alert">Не удалось загрузить данные. <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>Повторить</Button></div>}
      {!error && !(showingTimeline ? timeline : report) && <p role="status" className="text-meta">Загружаем данные…</p>}
      {report && tab === 'Обзор' && <>
        <Stats items={[
          ['Зарегистрировано всего', report.totals.registered], ['Новые за период', report.totals.new_users],
          ['Активны сегодня', report.totals.active_1], ['Активны за 7 дней', report.totals.active_7],
          ['Активны за 30 дней', report.totals.active_30], ['Ученики с учебным действием', report.totals.learners],
          ['Завершённые учебные действия', report.totals.learning_actions],
          ['Действий на активного ученика', report.totals.learners ? (report.totals.learning_actions / report.totals.learners).toFixed(1) : '—'],
          ['Начато тестов', report.events.filter(({ name }) => name === 'placement_started').reduce((sum, row) => sum + row.events, 0)],
          ['Завершено тестов', report.events.find(({ name }) => name === 'placement_completed')?.events ?? 0],
          ['Активация новых пользователей', ratio(report.cohort.activated, report.cohort.total)],
        ]} />
        <h2 className="text-section-title">Возвращаемость новых пользователей</h2>
        <Stats items={report.cohort.retention.map(({ day, eligible, returned }) => [`День ${day}`, ratio(returned, eligible)])} />
        <p className="text-meta">Учитываются наблюдаемые действия. Открытия экранов и комиксов доступны с момента запуска сбора.</p>
      </>}
      {report && tab === 'Обучение' && <>
        <h2 className="text-section-title">От регистрации до первого урока</h2>
        <Stats items={[
          ['Зарегистрировались', report.cohort.total], ['Приступили к тесту', report.cohort.started],
          ['Завершили тест', report.cohort.tested], ['Сдали упражнения по рекомендованной теме после теста', report.cohort.first_lesson],
        ]} />
        <h2 className="text-section-title">Действия по типам</h2>
        <Stats items={[[ 'Успешные первые проверки рекомендованных тем', report.totals.recommended_passes ]]} />
        <Stats items={report.events.filter(({ name }) => name.startsWith('topic_') || name === 'program_opened')
          .map(({ name, segment, events, users }) => [`${labels[name]} ${segments[segment] ? '· ' + segments[segment] : ''}`, `${events} · учеников ${users}`])} />
        <h2 className="text-section-title">Следование ежедневному плану</h2>
        <Stats items={[[ 'Полностью выполненные планы за прошедшие дни', ratio(report.adherence.finished, report.adherence.plans) ]]} />
        <h2 className="text-section-title">Завершение начатых занятий</h2>
        <Stats items={report.completion.map(({ name, finished, started }) => [labels[name], ratio(finished, started)])} />
      </>}
      {report && tab === 'Контент' && Object.entries(category).map(([type, title]) => <section key={type}>
        <h2 className="text-section-title">{title}</h2>
        <ul className="divide-y divide-border">
          {report.content.filter(({ content_type }) => content_type === type).map((item) => <li key={item.content_id} className="py-3">
            <p className="font-medium">{item.title}</p>
            <p className="text-meta">Учеников {item.users} · открытий {item.opens} · действий {item.actions} · завершений {item.finishes} · вернулись {item.returning}</p>
          </li>)}
        </ul>
      </section>)}
      {report && tab === 'Уведомления' && <>
        <Stats items={[
          ['Пользователи с напоминаниями сейчас', report.delivery.subscribers],
          ['Запланированные отправки к обработке', report.delivery.scheduled], ['Попытки отправки', report.delivery.attempted],
          ['Приняты push-сервисом', report.delivery.sent], ['Ошибки отправки', report.delivery.failed],
          ['Пользователи, нажавшие уведомление', report.delivery.clicked_users],
          ['CTR по принятым отправкам', ratio(report.delivery.clicks, report.delivery.sent)],
        ]} />
        <Stats items={report.events.filter(({ name }) => name.startsWith('reminder_') || name.startsWith('notification_permission'))
          .map(({ name, events, users }) => [labels[name], `${events} · пользователей ${users}`])} />
        <p className="text-meta">Подтверждение доставки на устройство сервис не предоставляет.</p>
      </>}
      {showingTimeline && <>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setOffset(0);
          setFilter({ user: String(form.get('user')), name: String(form.get('name')), content: String(form.get('content')) });
        }}>
          <label className="grid gap-1 text-meta">Email или ID <input name="user" key={filter.user} defaultValue={filter.user}
            className="rounded-lg border border-border bg-surface p-2 text-text" /></label>
          <label className="grid gap-1 text-meta">Событие <select name="name" className="rounded-lg border border-border bg-surface p-2 text-text">
            <option value="">Все события</option>
            {Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label className="grid gap-1 text-meta">ID контента <input name="content" className="rounded-lg border border-border bg-surface p-2 text-text" /></label>
          <Button type="submit" size="sm">Найти</Button>
        </form>
        {timeline?.rows.length === 0 && <p className="text-meta">За этот период событий нет.</p>}
        <ul className="divide-y divide-border">
          {timeline?.rows.map((row) => <li key={row.event_id} className="py-3">
            <details>
              <summary className="cursor-pointer"><strong>{labels[row.name] ?? row.name}</strong>{row.title && ` · ${row.title}`}
                <span className="ml-2 text-meta">{formatTime.format(new Date(row.occurred_at))}</span></summary>
              <button type="button" className="my-2 text-sm text-accent" onClick={() => { setOffset(0); setFilter({ ...filter, user: row.user_id }); }}>
                {row.email ?? row.user_id}
              </button>
              <pre className="whitespace-pre-wrap wrap-anywhere text-meta">{JSON.stringify({ source: row.source, content: row.content_id, ...row.properties }, null, 2)}</pre>
            </details>
          </li>)}
        </ul>
        {(offset > 0 || timeline?.more) && <div className="flex gap-2">
          <Button variant="secondary" disabled={!offset} onClick={() => setOffset((n) => n - 50)}>Назад</Button>
          <Button variant="secondary" disabled={!timeline?.more} onClick={() => setOffset((n) => n + 50)}>Дальше</Button>
        </div>}
      </>}
    </main>
  </div>;
}

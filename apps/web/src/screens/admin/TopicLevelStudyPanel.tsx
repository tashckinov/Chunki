import { useEffect, useState } from 'react';
import { TOPIC_STUDY_LEVELS, type CurriculumTopic, type TopicIdentity, type TopicLevelStudy, type TopicStudyLevel } from '@app/shared';
import { Button } from '../../components/ui/Button';
import { fetchAdminLevelStudy } from '../../lib/admin';
import { TopicStudyEditor } from './TopicStudyEditor';

type TopicScope = { topic: TopicIdentity; curriculum?: CurriculumTopic };

export function TopicLevelStudyPanel({ topic, curriculum }: TopicScope) {
  const [level, setLevel] = useState<TopicStudyLevel>();
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h2 className="text-section-title">Дополнительные объяснения по уровням</h2>
      <label className="flex flex-col gap-1 text-meta">Текущий уровень ученика
        <select value={level ?? ''} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-text"
          onChange={(event) => setLevel(TOPIC_STUDY_LEVELS.find((item) => item === event.target.value))}>
          <option value="">Выбрать уровень</option>
          {TOPIC_STUDY_LEVELS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      {level && <LevelEditor key={level} level={level} topic={topic} curriculum={curriculum} />}
    </section>
  );
}

function LevelEditor({ topic, curriculum, level }: TopicScope & { level: TopicStudyLevel }) {
  const [result, setResult] = useState<TopicLevelStudy>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    fetchAdminLevelStudy(topic.key, level).then(
      (value) => { if (active) setResult(value); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [level, reload, topic.key]);

  if (error) return (
    <>
      <p role="alert" className="text-negative">Не удалось загрузить объяснение.</p>
      <Button size="sm" variant="secondary" className="self-start" onClick={() => { setError(false); setReload(reload + 1); }}>
        Повторить
      </Button>
    </>
  );
  if (!result) return <p role="status" className="text-body-secondary">Загружаем объяснение…</p>;
  return <TopicStudyEditor topic={topic} curriculum={curriculum} study={result.study} level={level} />;
}

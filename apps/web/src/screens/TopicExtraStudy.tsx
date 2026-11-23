import { useState } from 'react';
import type { TopicLevelStudy } from '@app/shared';
import { TopicStudyMaterial } from '../components/chatmd/TopicStudyMaterial';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/collections';
import { fetchLearnerLevelStudy } from '../lib/program';

export function TopicExtraStudy({ topicId }: { topicId: string }) {
  const [material, setMaterial] = useState<TopicLevelStudy>();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (material) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setMaterial(await fetchLearnerLevelStudy(topicId));
      setExpanded(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403
        ? 'Дополнительные объяснения недоступны на вашем тарифе.'
        : 'Не получилось загрузить объяснение. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button size="lg" variant="secondary" disabled={loading} onClick={() => void toggle()}>
        {loading ? 'Готовим объяснение…' : expanded ? 'Скрыть объяснение' : material ? 'Показать объяснение' : 'Я не понял'}
      </Button>
      {loading && <p role="status" className="text-body-secondary">Подбираем примеры под ваш уровень.</p>}
      {error && <p role="alert" className="text-negative">{error}</p>}
      {expanded && material?.study && (
        <section aria-label={`Дополнительное объяснение · ${material.level}`} className="flex flex-col gap-4 rounded-2xl border border-border p-4">
          <h2 className="text-section-title">Дополнительное объяснение · {material.level}</h2>
          <TopicStudyMaterial study={material.study} />
        </section>
      )}
    </div>
  );
}

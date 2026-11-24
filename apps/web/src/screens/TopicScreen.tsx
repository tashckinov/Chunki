import { useAppStore } from '../store/appStore';
import { daysUntil } from '../lib/schedule';
import { TopicStudyMaterial } from '../components/chatmd/TopicStudyMaterial';
import { TopicStudyRating } from './TopicStudyRating';
import { TopicExtraStudy } from './TopicExtraStudy';
import { NavigationBar } from '../components/ui/NavigationBar';
import { Button } from '../components/ui/Button';

export function TopicScreen() {
  const s = useAppStore();
  const topic = s.programTopics.find((t) => t.id === s.activeTopicId);
  const study = s.activeTopicId ? s.topicStudyByTopic[s.activeTopicId] : undefined;

  if (!topic) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[19px] font-medium">Тема не найдена</div>
        <Button size="sm" onClick={s.goProgram}>
          К программе
        </Button>
      </div>
    );
  }

  const waitingForReconfirm = topic.status === 'passed_once' && topic.nextReviewAt && new Date(topic.nextReviewAt).getTime() > Date.now();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <NavigationBar title={topic.level ? `${topic.category} · ${topic.level}` : topic.category} onBack={s.back} />
      <div className="scroll-clean flex-1 min-h-0 px-5 pb-8 flex flex-col gap-7">
        <div>
          <div className="text-page-title">{topic.topicNumber != null && `№${topic.topicNumber} · `}{topic.title}</div>
          <div className="text-meta mt-1.5">{topic.rationale}</div>
        </div>

        {!study && !s.topicStudyError && <div className="text-body-secondary py-8 text-center">Готовим материал…</div>}

        {!study && s.topicStudyError && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="text-body-secondary">Не получилось загрузить материал.</div>
            <Button size="sm" onClick={() => void s.openTopic(topic.id, s.topicMode)}>
              Повторить
            </Button>
          </div>
        )}

        {study && <TopicStudyMaterial key={topic.id} study={study} />}
        {study && <TopicStudyRating key={topic.id + '-rating'} topicId={topic.id} />}

        {topic.status !== 'assigned' && (
          <div className="space-y-1 border-l-2 border-accent pl-4">
            <p className="text-sm font-semibold">Вы уже прошли эту тему</p>
            <p className="text-body-secondary">Освежите правило и попробуйте применить его в разговоре или письме.</p>
          </div>
        )}
        {waitingForReconfirm && topic.nextReviewAt && (
          <div className="text-body-secondary border-l-2 border-border pl-4">Контрольная проверка будет доступна через {daysUntil(topic.nextReviewAt)} дн.</div>
        )}
        {study && <TopicExtraStudy key={topic.id} topicId={topic.id} />}
        {s.topicMode === 'study' && topic.status !== 'mastered' && !waitingForReconfirm && (
          <Button size="lg" onClick={() => void s.goExercises()} className="w-full">
            К упражнениям
          </Button>
        )}
      </div>
    </div>
  );
}

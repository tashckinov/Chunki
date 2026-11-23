import type { TopicStudyContent } from '@app/shared';
import { ChatMD } from './ChatMD';

export function TopicStudyMaterial({ study }: { study: TopicStudyContent }) {
  return (
    <>
      <ChatMD source={study.explanation} />

      {study.keyPoints.length > 0 && (
        <div>
          <div className="text-section-title mb-3">Ключевые моменты</div>
          <div className="flex flex-col gap-2">
            {study.keyPoints.map((point, i) => (
              <div key={i} className="flex gap-3 text-[15px] leading-[22px]">
                <span className="w-1 rounded-full bg-accent flex-none" />
                <div>{point}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {study.contrastExamples.length > 0 && (
        <div className="flex flex-col divide-y divide-border border-t border-b border-border">
          {study.contrastExamples.map((c, i) => (
            <div key={i} className="flex gap-4 py-4">
              <div className="flex-1 text-[15px] leading-[22px] text-negative">
                <div className="text-meta mb-1">Неверно</div>
                {c.wrong}
              </div>
              <div className="flex-1 text-[15px] leading-[22px]">
                <div className="text-[12.5px] font-medium text-accent mb-1">Верно</div>
                {c.right}
              </div>
            </div>
          ))}
        </div>
      )}

      {study.exampleChunks.length > 0 && (
        <div>
          <div className="text-section-title mb-3">Полезные выражения</div>
          <div className="flex gap-2 flex-wrap">
            {study.exampleChunks.map((chunk) => (
              <span key={chunk} className="rounded-full bg-surface-subtle px-3.5 py-2 text-[14px] text-text-secondary">
                {chunk}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

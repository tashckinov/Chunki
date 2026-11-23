import type { TopicLevelStudy } from '@app/shared';
import { getJson, postJson } from './collections';

export async function requestTopicLevelStudy(path: string): Promise<TopicLevelStudy> {
  let material = await postJson<TopicLevelStudy>(path, {});
  for (let attempt = 0; !material.study && material.generating && attempt < 36; attempt++) {
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
    material = await getJson<TopicLevelStudy>(path);
  }
  if (!material.study) throw new Error('Additional explanation is unavailable');
  return material;
}

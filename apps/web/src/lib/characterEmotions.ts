import type { CharacterImage } from './characters';

export const EMOTION_LABELS: Record<string, string> = {
  happy: 'Счастье',
  laughing: 'Смех',
  confused: 'Растерянность',
  surprised: 'Удивление',
  neutral: 'Нейтрально',
  annoyed: 'Раздражение',
};
export const EMOTION_SUGGESTIONS = ['happy', 'laughing', 'confused', 'surprised', 'neutral', 'annoyed'];

export function emotionLabel(emotion: string): string {
  return EMOTION_LABELS[emotion] ?? emotion;
}

export function groupImagesByEmotion(images: CharacterImage[]): [string, CharacterImage[]][] {
  const groups = new Map<string, CharacterImage[]>();
  for (const image of [...images].sort((a, b) => a.position - b.position)) {
    const list = groups.get(image.emotion) ?? [];
    list.push(image);
    groups.set(image.emotion, list);
  }
  return [...groups.entries()];
}

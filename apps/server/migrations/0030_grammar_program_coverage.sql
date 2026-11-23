-- A small extension for the previously sparse upper levels. Existing catalog
-- IDs and topic numbers remain stable.
INSERT INTO curriculum_topics (id, title, level, category, objective, subtopics, source)
VALUES
  ('b2-wish', 'Wish о настоящем', 'B2', 'Grammar',
   'Выразить желание изменить существующую ситуацию, используя wish с прошедшей формой.',
   ARRAY['wish + Past Simple', 'wish + could'], 'https://www.eaquals.org/resources/the-core-inventory-for-general-english/'),
  ('c1-passive-narratives', 'Пассив в рассказе о прошлом', 'C1', 'Grammar',
   'Выбрать пассивную форму, чтобы расставить акценты и сохранить последовательность событий в сложном рассказе.',
   ARRAY['Пассивные формы прошедшего времени', 'Смена фокуса между деятелем и результатом'], 'https://www.eaquals.org/resources/the-core-inventory-for-general-english/'),
  ('c1-formal-signposting', 'Навигация в формальном выступлении', 'C1', 'Discourse',
   'Обозначить структуру формального аргумента и сделать переходы между тезисами ясными.',
   ARRAY['Ввод тезиса', 'Переход к возражению', 'Подведение итога'], 'https://www.eaquals.org/resources/the-core-inventory-for-general-english/')
ON CONFLICT DO NOTHING;

-- Re-evaluate short programs once when the learner comes back. The build
-- endpoint still checks the visible count before calling the provider.
WITH latest AS (
  SELECT DISTINCT ON (user_id) id FROM placement_tests ORDER BY user_id, created_at DESC, id DESC
)
UPDATE placement_tests p SET program_built_at = NULL
FROM latest WHERE p.id = latest.id AND p.program_built_at IS NOT NULL;

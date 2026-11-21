-- Classify the existing catalog by the teaching scope in its current titles.
-- Keep any CEFR level already set in the catalog.
UPDATE program_topics AS topic
SET level = review.level
FROM (VALUES
  ('Базовые соединительные слова', 'A1'),
  ('Выделение фактов в тексте', 'A2'),
  ('Выражения для описания активностей', 'A2'),
  ('Краткие ответы на вопросы по тексту', 'A2'),
  ('Лексика для описания изменений и развития', 'B1'),
  ('Множественное число и исчисляемые существительные', 'A2'),
  ('Навыки перефразирования', 'B1'),
  ('Настоящее и прошедшее время', 'A2'),
  ('Неправильные глаголы в прошедшем времени', 'A2'),
  ('Описывать проблемы и их решения', 'B1'),
  ('Описывать прошлый опыт', 'B1'),
  ('Письмо: короткие рассказы', 'B1'),
  ('Понимание вопросов', 'A1'),
  ('Порядок слов в вопросах', 'A2'),
  ('Порядок слов в вопросах и утверждениях', 'A2'),
  ('Правильные глаголы в прошедшем времени', 'A1'),
  ('Правописание распространённых существительных', 'A1'),
  ('Прошедшее и настоящее время', 'A2'),
  ('Разница между Present Simple, Past Simple и Present Perfect', 'B1'),
  ('Регистр и использование заглавных букв', 'A1'),
  ('Связки и маркеры времени', 'A2'),
  ('Связность и логические связки', 'B1'),
  ('Связные слова для выражения причины и следствия (because, so, that’s why)', 'A2'),
  ('Структура абзаца в письме', 'B1'),
  ('Умение объяснить иначе при нехватке слова', 'B1'),
  ('Устойчивые выражения с learn и know', 'A2'),
  ('Формальный и неформальный стиль', 'B1'),
  ('Фразы для кафе и ресторанов', 'A2'),
  ('Фразы для собеседований', 'B1'),
  ('Чанки на тему ''сообщество'',''взаимопомощь'',''общение''', 'B1'),
  ('Чанки про кафе и рестораны', 'A2')
) AS review(title, level)
WHERE topic.title_key = program_topic_name(review.title) AND topic.level IS NULL;

-- Only merge exact equivalents reviewed in the existing catalog. Keep topics
-- with overlapping scopes (e.g. question order vs. questions and statements).
CREATE TEMP TABLE topic_cleanup_catalog ON COMMIT DROP AS
SELECT DISTINCT key AS old_key, winner AS catalog_key
FROM (
  SELECT topic.key, first_value(topic.key) OVER (
    PARTITION BY pair.preferred
    ORDER BY (topic.title_key = program_topic_name(pair.preferred)) DESC, topic.key
  ) AS winner
  FROM (VALUES
    ('Настоящее и прошедшее время', 'Прошедшее и настоящее время'),
    ('Фразы для кафе и ресторанов', 'Чанки про кафе и рестораны')
  ) AS pair(preferred, duplicate)
  JOIN program_topics topic ON topic.title_key IN (program_topic_name(pair.preferred), program_topic_name(pair.duplicate))
) matched
WHERE key <> winner;

CREATE TEMP TABLE topic_cleanup_progress ON COMMIT DROP AS
SELECT id, catalog_key, first_value(id) OVER (
  PARTITION BY user_id, catalog_key
  ORDER BY CASE status WHEN 'mastered' THEN 3 WHEN 'passed_once' THEN 2 ELSE 1 END DESC,
    already_canonical DESC, created_at, id
) AS winner
FROM (
  SELECT t.id, t.user_id, t.status, t.created_at, COALESCE(m.catalog_key, t.catalog_key) AS catalog_key,
    m.old_key IS NULL AS already_canonical
  FROM user_topics t
  LEFT JOIN topic_cleanup_catalog m ON m.old_key = t.catalog_key
  WHERE m.old_key IS NOT NULL OR t.catalog_key IN (SELECT catalog_key FROM topic_cleanup_catalog)
) affected;

-- Retain attempts and old links, including redirects created in migration 0026.
UPDATE user_topic_redirects r SET topic_id = p.winner
FROM topic_cleanup_progress p WHERE r.topic_id = p.id AND p.id <> p.winner;

INSERT INTO user_topic_redirects (old_id, topic_id)
SELECT id, winner FROM topic_cleanup_progress WHERE id <> winner;

UPDATE user_topics t SET study_content = lesson.study_content
FROM (
  SELECT DISTINCT ON (p.winner) p.winner, old.study_content
  FROM topic_cleanup_progress p JOIN user_topics old ON old.id = p.id
  WHERE p.id <> p.winner AND old.study_content IS NOT NULL
  ORDER BY p.winner, old.updated_at DESC, old.id
) lesson WHERE t.id = lesson.winner AND t.study_content IS NULL;

UPDATE topic_attempts a SET user_topic_id = p.winner
FROM topic_cleanup_progress p WHERE a.user_topic_id = p.id AND p.id <> p.winner;

DELETE FROM user_topics t USING topic_cleanup_progress p WHERE t.id = p.id AND p.id <> p.winner;

UPDATE user_topics t SET catalog_key = p.catalog_key
FROM topic_cleanup_progress p WHERE t.id = p.winner AND p.id = p.winner AND t.catalog_key <> p.catalog_key;

UPDATE program_topics winner
SET aliases = ARRAY(
      SELECT DISTINCT alias
      FROM topic_cleanup_catalog m JOIN program_topics old ON old.key = m.old_key
      CROSS JOIN LATERAL unnest(winner.aliases || old.aliases || ARRAY[old.key, old.title_key]) AS names(alias)
      WHERE m.catalog_key = winner.key
      ORDER BY alias
    ),
    study_content = COALESCE(winner.study_content, (
      SELECT old.study_content FROM topic_cleanup_catalog m JOIN program_topics old ON old.key = m.old_key
      WHERE m.catalog_key = winner.key AND old.study_content IS NOT NULL ORDER BY old.key LIMIT 1
    ))
WHERE winner.key IN (SELECT catalog_key FROM topic_cleanup_catalog);

DELETE FROM program_topics old USING topic_cleanup_catalog m WHERE old.key = m.old_key;

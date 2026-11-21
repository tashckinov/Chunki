CREATE FUNCTION program_topic_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(
    lower(translate(value, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё',
                           'абвгдеежзийклмнопрстуфхцчшщъыьэюяе')),
    '[^a-zа-я0-9]+', '-', 'g'))
$$;

CREATE TABLE program_topics (
  key text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  -- Imported concepts with no reliable level are classified when rediscovered.
  level text CHECK (level IN ('A1','A2','A2+','B1','B1+','B2','B2+','C1')),
  title_key text GENERATED ALWAYS AS (program_topic_name(title)) STORED,
  aliases text[] NOT NULL DEFAULT '{}',
  study_content jsonb,
  UNIQUE (category, title_key)
);

INSERT INTO program_topics (key, title, category, level, aliases)
SELECT key, title, 'Грамматика', level, aliases FROM (VALUES
  ('articles', 'Артикли: a, an, the', 'A2', ARRAY['артикли','артикли-a-an-the','артикли-a-the-нулевой','артикли-в-английском','articles-a-an-the','a-an-the','english-articles','article-usage','articles-basic']),
  ('verb-to-be', 'Глагол to be', 'A1', ARRAY['to-be','verb-be','глагол-to-be']),
  ('present-simple', 'Present Simple', 'A1', ARRAY['simple-present','настоящее-простое-время']),
  ('present-continuous', 'Present Continuous', 'A1', ARRAY['present-progressive','настоящее-длительное-время']),
  ('past-simple', 'Past Simple', 'A1', ARRAY['simple-past','простое-прошедшее-время']),
  ('plural-nouns', 'Множественное число существительных', 'A1', ARRAY['nouns-plural','множественное-число']),
  ('personal-pronouns', 'Личные местоимения', 'A1', ARRAY['subject-pronouns','личные-местоимения']),
  ('there-is-there-are', 'There is и there are', 'A1', ARRAY['there-is-are','there-is-there-are']),
  ('comparatives', 'Сравнительная и превосходная степени', 'A2', ARRAY['comparatives-and-superlatives','degrees-of-comparison','степени-сравнения-прилагательных']),
  ('countable-uncountable', 'Исчисляемые и неисчисляемые существительные', 'A2', ARRAY['countable-and-uncountable-nouns','countable-uncountable-nouns']),
  ('prepositions-time', 'Предлоги времени: at, on, in', 'A2', ARRAY['time-prepositions','prepositions-of-time','предлоги-времени']),
  ('prepositions-place', 'Предлоги места: at, on, in', 'A2', ARRAY['place-prepositions','prepositions-of-place','предлоги-места']),
  ('word-order', 'Порядок слов и наречия частоты', 'A2', ARRAY['adverbs-of-frequency','порядок-слов-и-наречия-частоты']),
  ('past-continuous', 'Past Continuous', 'A2', ARRAY['past-progressive','прошедшее-длительное-время']),
  ('present-perfect', 'Present Perfect и Past Simple', 'B1', ARRAY['present-perfect-vs-past-simple','present-perfect-past-simple']),
  ('first-conditional', 'Первый тип условных предложений', 'B1', ARRAY['conditionals-1','conditional-type-1','первый-тип-условных']),
  ('second-conditional', 'Второй тип условных предложений', 'B1', ARRAY['conditionals-2','conditional-type-2','второй-тип-условных']),
  ('relative-clauses', 'Относительные придаточные с who, which, that', 'B1', ARRAY['defining-relative-clauses','относительные-придаточные']),
  ('passive-voice', 'Пассивный залог', 'B1', ARRAY['passive','пассивный-залог','страдательный-залог']),
  ('reported-speech', 'Косвенная речь', 'B1', ARRAY['indirect-speech','косвенная-речь']),
  ('modal-probability', 'Модальные глаголы вероятности', 'B1', ARRAY['modals-of-deduction','modal-verbs-of-probability','модальные-глаголы-вероятности']),
  ('third-conditional', 'Третий тип условных предложений', 'B2', ARRAY['conditionals-3','conditional-type-3','третий-тип-условных']),
  ('mixed-conditionals', 'Смешанные условные предложения', 'B2', ARRAY['mixed-conditional','смешанные-условные']),
  ('negative-inversion', 'Инверсия после отрицательных наречий', 'C1', ARRAY['inversion-after-negative-adverbials','negative-adverbial-inversion','инверсия-после-отрицательных-наречий']),
  ('cleft-sentences', 'Эмфатические конструкции it-cleft и what-cleft', 'C1', ARRAY['clefts','cleft-sentence'])
) AS seed(key, title, level, aliases);

ALTER TABLE user_topics ADD COLUMN catalog_key text REFERENCES program_topics(key);

-- Prefer curated identities and exact titles. Unclassified historical topics keep
-- their wording, without guessing a CEFR level or sharing personalized content.
UPDATE user_topics AS u
SET catalog_key = c.key
FROM (
  SELECT DISTINCT ON (old.id) old.id, topic.key
  FROM user_topics old JOIN program_topics topic ON
    program_topic_name(old.key) = topic.key
    OR topic.title_key = program_topic_name(old.title)
    OR topic.aliases && ARRAY[program_topic_name(old.key), program_topic_name(old.title)]
  ORDER BY old.id, (topic.key = program_topic_name(old.key)) DESC, topic.key
) c WHERE u.id = c.id;

INSERT INTO program_topics (key, title, category)
SELECT DISTINCT ON (u.category, program_topic_name(u.title))
  'legacy-' || md5(u.category || ':' || program_topic_name(u.title)), u.title, u.category
FROM user_topics u WHERE u.catalog_key IS NULL
ORDER BY u.category, program_topic_name(u.title), u.created_at, u.id
ON CONFLICT (category, title_key) DO NOTHING;

UPDATE user_topics u SET catalog_key = topic.key
FROM program_topics topic
WHERE u.catalog_key IS NULL AND topic.category = u.category AND topic.title_key = program_topic_name(u.title);

CREATE TABLE user_topic_redirects (
  old_id uuid PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES user_topics(id) ON DELETE CASCADE
);

-- Keep the strongest status, the associated dates, all attempts and any
-- previously saved lesson if the surviving record has none.
INSERT INTO user_topic_redirects (old_id, topic_id)
SELECT id, winner FROM (
  SELECT id, first_value(id) OVER (
    PARTITION BY user_id, catalog_key
    ORDER BY CASE status WHEN 'mastered' THEN 3 WHEN 'passed_once' THEN 2 ELSE 1 END DESC,
      created_at, id
  ) AS winner
  FROM user_topics
) ranked WHERE id <> winner;

UPDATE user_topics u SET study_content = lesson.study_content
FROM (
  SELECT DISTINCT ON (r.topic_id) r.topic_id, old.study_content
  FROM user_topic_redirects r JOIN user_topics old ON old.id = r.old_id
  WHERE old.study_content IS NOT NULL
  ORDER BY r.topic_id, old.updated_at DESC, old.id
) lesson WHERE u.id = lesson.topic_id AND u.study_content IS NULL;

UPDATE topic_attempts a SET user_topic_id = r.topic_id FROM user_topic_redirects r WHERE a.user_topic_id = r.old_id;
DELETE FROM user_topics u USING user_topic_redirects r WHERE u.id = r.old_id;

ALTER TABLE user_topics ALTER COLUMN catalog_key SET NOT NULL;
ALTER TABLE user_topics DROP CONSTRAINT user_topics_user_id_key_key;
ALTER TABLE user_topics ADD CONSTRAINT user_topics_user_id_catalog_key_unique UNIQUE (user_id, catalog_key);

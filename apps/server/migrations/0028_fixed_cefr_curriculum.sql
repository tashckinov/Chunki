CREATE TABLE curriculum_topics (
  id text PRIMARY KEY CHECK (length(id) <= 72 AND id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  level text NOT NULL CHECK (level IN ('A1','A2','A2+','B1','B1+','B2','B2+','C1')),
  category text NOT NULL CHECK (category IN ('Grammar','Vocabulary','Functions','Discourse','Reading','Writing','Listening','Speaking')),
  objective text NOT NULL CHECK (length(btrim(objective)) BETWEEN 1 AND 800),
  subtopics text[] NOT NULL DEFAULT '{}',
  source text
);

CREATE UNIQUE INDEX curriculum_topics_normalized_title
  ON curriculum_topics (level, category, program_topic_name(title));

-- A small Chunki selection, adapted from the British Council / Eaquals
-- Core Inventory for General English. Objectives are original.
INSERT INTO curriculum_topics (id, title, level, category, objective, subtopics, source)
SELECT id, title, level, category, objective, subtopics,
  'https://www.eaquals.org/resources/the-core-inventory-for-general-english/'
FROM (VALUES
  ('a1-verb-to-be', 'Глагол to be', 'A1', 'Grammar', 'Представиться и сказать, кто или где находится, используя am, is и are.', ARRAY['Утверждения','Отрицания','Общие вопросы']),
  ('a1-present-simple', 'Present Simple', 'A1', 'Grammar', 'Описать привычки и распорядок дня в простых предложениях.', ARRAY['Окончание -s в третьем лице','Вопросы и отрицания с do и does']),
  ('a1-past-simple', 'Past Simple', 'A1', 'Grammar', 'Рассказать о завершившемся событии в прошлом простыми предложениями.', ARRAY['Частотные формы прошедшего времени','Вопросы и отрицания с did']),
  ('a1-food-drink', 'Еда и напитки', 'A1', 'Vocabulary', 'Назвать распространённые продукты и напитки и распознать их в простом меню.', ARRAY['Продукты','Напитки']),
  ('a2-articles', 'Артикли: a, an, the', 'A2', 'Grammar', 'Различать первое упоминание предмета и отсылку к уже известному предмету. Учитывать исчисляемость существительного при выборе артикля.', ARRAY['a и an','the','Типичные случаи без артикля']),
  ('a2-past-continuous', 'Past Continuous', 'A2', 'Grammar', 'Описать действие, которое происходило в определённый момент в прошлом, и указать, что его прервало.', ARRAY['was/were + -ing','Фон и короткое событие']),
  ('a2-requests', 'Вежливые просьбы', 'A2', 'Functions', 'Попросить о помощи, предмете или простой услуге и вежливо отреагировать на ответ.', ARRAY['Can you…?','Could you…?','Please']),
  ('b1-present-perfect-past-simple', 'Present Perfect и Past Simple', 'B1', 'Grammar', 'Отличать рассказ об опыте или результате к настоящему моменту от рассказа о событии в завершённый период.', ARRAY['Опыт без точной даты','Завершённое время в прошлом']),
  ('b1-second-conditional', 'Второй тип условных предложений', 'B1', 'Grammar', 'Обсудить воображаемую ситуацию в настоящем или будущем и её вероятный результат.', ARRAY['if + Past Simple','would + инфинитив']),
  ('b1-opinions', 'Мнение и согласие', 'B1', 'Functions', 'Кратко выразить свою позицию и вежливо согласиться или возразить в знакомой ситуации.', ARRAY['Обоснование мнения','Вежливое несогласие']),
  ('b2-mixed-conditionals', 'Смешанные условные предложения', 'B2', 'Grammar', 'Связать нереальное условие в прошлом с его воображаемым следствием в настоящем.', ARRAY['Условие в прошлом','Результат в настоящем']),
  ('b2-discourse-contrast', 'Связки для уступки и контраста', 'B2', 'Discourse', 'Связать два противопоставленных тезиса в коротком аргументе, сохраняя ясность и грамматическую форму.', ARRAY['although','despite и in spite of','Контраст между тезисами']),
  ('c1-negative-inversion', 'Инверсия после отрицательных наречий', 'C1', 'Grammar', 'Использовать инверсию для смыслового акцента в формальной речи и письме.', ARRAY['Начальная позиция отрицательного наречия','Порядок вспомогательного глагола и подлежащего'])
) AS seed(id, title, level, category, objective, subtopics);

ALTER TABLE program_topics ADD COLUMN curriculum_id text REFERENCES curriculum_topics(id);
ALTER TABLE program_topics ADD COLUMN curriculum_slot boolean NOT NULL DEFAULT false;
ALTER TABLE program_topics ADD CONSTRAINT curriculum_slot_requires_topic CHECK (NOT curriculum_slot OR curriculum_id IS NOT NULL);

-- Legacy and curriculum-backed lessons may share a title. Their material and
-- study histories remain separate, even when a legacy concept is linked.
ALTER TABLE program_topics DROP CONSTRAINT program_topics_category_title_key_key;
CREATE UNIQUE INDEX program_topics_legacy_title ON program_topics(category, title_key) WHERE NOT curriculum_slot;
CREATE UNIQUE INDEX program_topics_curriculum_slot ON program_topics(curriculum_id) WHERE curriculum_slot;
CREATE INDEX program_topics_curriculum_id ON program_topics(curriculum_id);

UPDATE program_topics p SET curriculum_id = c.id
FROM (VALUES
  ('verb-to-be','a1-verb-to-be'),
  ('present-simple','a1-present-simple'),
  ('past-simple','a1-past-simple'),
  ('articles','a2-articles'),
  ('past-continuous','a2-past-continuous'),
  ('present-perfect','b1-present-perfect-past-simple'),
  ('second-conditional','b1-second-conditional'),
  ('mixed-conditionals','b2-mixed-conditionals'),
  ('negative-inversion','c1-negative-inversion')
) AS mapping(key, id)
JOIN curriculum_topics c ON c.id = mapping.id
WHERE p.key = mapping.key AND p.level = c.level AND p.title_key = program_topic_name(c.title) AND p.category = 'Грамматика';

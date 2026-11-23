-- Give admins access to every catalog topic before its first assignment.
INSERT INTO program_topics (key, title, category, level, curriculum_id, curriculum_slot)
SELECT 'curriculum-' || gen_random_uuid(), title,
  CASE category
    WHEN 'Grammar' THEN 'Грамматика'
    WHEN 'Vocabulary' THEN 'Лексика'
    WHEN 'Topics' THEN 'Лексика'
    WHEN 'Reading' THEN 'Понимание'
    WHEN 'Listening' THEN 'Понимание'
    WHEN 'Writing' THEN 'Письмо'
    ELSE 'Использование языка'
  END, level, id, true
FROM curriculum_topics
ON CONFLICT (curriculum_id) WHERE curriculum_slot DO NOTHING;

-- Replace the reported Russian-as-target lesson only when the faulty content
-- is still present. Leave unrelated and already corrected lessons intact.
UPDATE program_topics
SET study_content = jsonb_build_object(
  'explanation', $lesson$В английском меню еду и напитки часто перечисляют отдельными словами.

### Еда
- **bread** — хлеб
- **cheese** — сыр
- **an egg** — яйцо
- **an apple** — яблоко

### Напитки
- **water** — вода
- **tea** — чай
- **coffee** — кофе
- **juice** — сок
- **milk** — молоко

:::example
**I eat bread.** — Я ем хлеб.
**I drink milk.** — Я пью молоко.
:::

:::question
В меню нужно найти сок. Какое слово искать?
+ juice | Верно. Juice — это сок.
- cheese | Cheese — это сыр.
- water | Water — это вода.
:::

:::question
Как сказать по-английски «Я пью чай»?
+ I drink tea. | Drink — пить, tea — чай.
- I eat tea. | Eat означает «есть». Для напитка здесь подходит drink.
- I drink milk. | Milk — это молоко. Для чая нужно слово tea.
:::$lesson$::text,
  'keyPoints', '[]'::jsonb,
  'contrastExamples', '[]'::jsonb,
  'exampleChunks', '[]'::jsonb
)
WHERE curriculum_id = 'a1-food-drink'
  AND study_content->>'explanation' LIKE '%Как сказать по-русски%'
  AND study_content->>'explanation' LIKE '%Я пью молоко%';

-- A regenerated program can withdraw unstarted recommendations without
-- deleting their assignment IDs or any recorded learner data.
ALTER TABLE user_topics ADD COLUMN withdrawn_at timestamptz;

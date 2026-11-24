import { CEFR_LEVELS, type CurriculumModule, type CurriculumModulePreview } from '@app/shared';
import { pool } from '../../db/pool.js';

export async function listCurriculumModules(): Promise<CurriculumModule[]> {
  const { rows } = await pool.query<CurriculumModule>(
    `SELECT m.*, ARRAY(SELECT t.topic_id FROM curriculum_module_topics t
       WHERE t.module_id = m.id ORDER BY t.position) AS "topicIds"
     FROM curriculum_modules m ORDER BY array_position($1::text[], m.level), m.position, m.id`,
    [CEFR_LEVELS],
  );
  return rows;
}

export async function importCurriculumModules(modules: CurriculumModule[], previewOnly: boolean, createOnly = false): Promise<CurriculumModulePreview> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!previewOnly) await client.query("SELECT pg_advisory_xact_lock(hashtext('curriculum-modules'))");

    const topicIds = [...new Set(modules.flatMap((module) => module.topicIds))];
    const { rows: topics } = await client.query<{ id: string; level: string }>(
      'SELECT id, level FROM curriculum_topics WHERE id = ANY($1::text[])' + (previewOnly ? '' : ' FOR SHARE'), [topicIds],
    );
    const levels = new Map(topics.map(({ id, level }) => [id, level.replace('+', '')]));
    const { rows: existing } = await client.query<{ id: string }>(
      'SELECT id FROM curriculum_modules WHERE id = ANY($1::text[])', [modules.map(({ id }) => id)],
    );
    const existingIds = new Set(existing.map(({ id }) => id));
    const moduleIds = new Set<string>();
    const issues: string[] = [];
    for (const module of modules) {
      if (moduleIds.has(module.id)) issues.push(`Модуль «${module.id}» указан несколько раз.`);
      moduleIds.add(module.id);
      if (createOnly && existingIds.has(module.id)) issues.push('ID «' + module.id + '» уже используется.');
      const seen = new Set<string>();
      for (const id of module.topicIds) {
        if (seen.has(id)) issues.push(`Модуль «${module.id}»: тема «${id}» повторяется.`);
        seen.add(id);
        const level = levels.get(id);
        if (!level) issues.push(`Модуль «${module.id}»: тема «${id}» не найдена.`);
        else if (level !== module.level.replace('+', '')) issues.push(`Модуль «${module.id}»: уровень темы «${id}» (${level}) отличается от уровня модуля.`);
      }
    }
    const changes = modules.map(({ id, title, topicIds }) => ({
      id, title, action: existingIds.has(id) ? 'update' as const : 'create' as const, topics: topicIds.length,
    }));
    if (!previewOnly && !issues.length) {
      const json = JSON.stringify(modules);
      await client.query(
        `INSERT INTO curriculum_modules (id,title,description,level,position,type)
         SELECT id,title,description,level,position,type
         FROM jsonb_to_recordset($1::jsonb) AS m(id text,title text,description text,level text,position integer,type text)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
           level=EXCLUDED.level, position=EXCLUDED.position, type=EXCLUDED.type`, [json],
      );
      await client.query('DELETE FROM curriculum_module_topics WHERE module_id = ANY($1::text[])', [[...moduleIds]]);
      await client.query(
        `INSERT INTO curriculum_module_topics (module_id, topic_id, position)
         SELECT m.id, t.id, t.position - 1
         FROM jsonb_to_recordset($1::jsonb) AS m(id text,"topicIds" jsonb)
         CROSS JOIN LATERAL jsonb_array_elements_text(m."topicIds") WITH ORDINALITY AS t(id, position)`, [json],
      );
    }
    await client.query('COMMIT');
    return { issues, changes };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCurriculumModule(id: string) {
  const result = await pool.query('DELETE FROM curriculum_modules WHERE id = $1', [id]);
  return result.rowCount === 1;
}

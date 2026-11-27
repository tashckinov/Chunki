// A module is assigned through an active recommendation. A self-selected
// lesson can never unlock another module, even when it belongs to both.
export function assignedModule(user: string, module: string) {
  return `EXISTS (
    SELECT 1 FROM curriculum_module_topics included
    JOIN program_topics recommended ON recommended.curriculum_id = included.topic_id
    JOIN user_topics assignment ON assignment.catalog_key = recommended.key
    WHERE included.module_id = ${module} AND assignment.user_id = ${user}
      AND assignment.withdrawn_at IS NULL AND assignment.source IN ('placement', 'discovered')
  )`;
}

export function neighboringTopic(user: string, curriculum: string) {
  return `EXISTS (
    SELECT 1 FROM curriculum_module_topics neighbor
    WHERE neighbor.topic_id = ${curriculum} AND ${assignedModule(user, 'neighbor.module_id')}
  )`;
}

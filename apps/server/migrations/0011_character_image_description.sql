-- Optional per-image description (e.g. "good"/"bad" within the same
-- emotion) so an AI generating a dialogue can pick the right variant among
-- several images sharing one emotion instead of always guessing.
ALTER TABLE character_images ADD COLUMN description TEXT;

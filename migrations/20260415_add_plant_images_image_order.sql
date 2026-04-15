ALTER TABLE plant_images
ADD COLUMN IF NOT EXISTS image_order integer;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY batch_id
      ORDER BY created_at ASC, id ASC
    ) - 1 AS next_image_order
  FROM plant_images
  WHERE batch_id IS NOT NULL
)
UPDATE plant_images AS target
SET image_order = ranked.next_image_order
FROM ranked
WHERE target.id = ranked.id
  AND target.image_order IS NULL;

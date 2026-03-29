ALTER TABLE analysis_sections
ADD COLUMN IF NOT EXISTS plant_image_id uuid REFERENCES plant_images(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_analysis_sections_plant_image_id
ON analysis_sections (plant_image_id);

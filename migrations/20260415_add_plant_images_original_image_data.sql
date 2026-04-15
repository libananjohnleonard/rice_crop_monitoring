ALTER TABLE plant_images
ADD COLUMN IF NOT EXISTS original_image_data text;

UPDATE plant_images
SET original_image_data = image_data
WHERE original_image_data IS NULL;

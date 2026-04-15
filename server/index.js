import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

async function ensureOriginalImageColumn() {
  await pool.query(`
    ALTER TABLE plant_images
    ADD COLUMN IF NOT EXISTS original_image_data text
  `);

  await pool.query(`
    UPDATE plant_images
    SET original_image_data = image_data
    WHERE original_image_data IS NULL
  `);
}

async function ensureImageOrderColumn() {
  await pool.query(`
    ALTER TABLE plant_images
    ADD COLUMN IF NOT EXISTS image_order integer
  `);

  await pool.query(`
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
      AND target.image_order IS NULL
  `);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function getStatusFromScore(score) {
  if (score >= 75) return 'Healthy';
  if (score >= 55) return 'Moderate';
  return 'Poor';
}

function getHarvestStatus(yellowPercentage, greenPercentage, healthScore) {
  if (
    yellowPercentage >= 55 ||
    (yellowPercentage >= 35 && healthScore < 45)
  ) {
    return 'Needs Attention or Overripe';
  }

  if (
    yellowPercentage >= 30 &&
    yellowPercentage >= greenPercentage * 0.8 &&
    healthScore >= 45
  ) {
    return 'Ready to Harvest';
  }

  if (
    yellowPercentage >= 15 &&
    yellowPercentage >= greenPercentage * 0.3 &&
    healthScore >= 40
  ) {
    return 'Nearly Ready';
  }

  return 'Not Ready';
}

function buildInterpretation(category, excludedCount = 0) {
  const suffix =
    excludedCount > 0
      ? ` Re-analysis applied with ${excludedCount} excluded section${
          excludedCount === 1 ? '' : 's'
        }.`
      : '';

  if (category === 'whole_field') {
    return `Whole-field image analyzed per section using grid-based color segmentation.${suffix}`;
  }

  if (category === 'partial_field') {
    return `Partial-field image analyzed using a smaller grid-based section breakdown.${suffix}`;
  }

  return `Close-up plant image analyzed using image color segmentation.${suffix}`;
}

function summarizeSections(sections, category) {
  const includedSections = sections.filter((section) => !section.isExcluded);
  const safeSections = includedSections.length > 0 ? includedSections : [];

  if (safeSections.length === 0) {
    return {
      status: 'Poor',
      healthScore: 0,
      green: 0,
      yellow: 0,
      brown: 0,
      totalSections: 0,
      healthySections: 0,
      warningSections: 0,
      poorSections: 0,
      selectedSectionId: sections[0]?.sectionLabel ?? null,
      gridEstimate:
        sections[0]?.gridRows && sections[0]?.gridCols
          ? `${sections[0].gridRows}x${sections[0].gridCols}`
          : null,
      interpretation: buildInterpretation(category, sections.length),
      gridRows: sections[0]?.gridRows ?? null,
      gridCols: sections[0]?.gridCols ?? null,
      sections,
    };
  }

  const totalSections = safeSections.length;
  const healthySections = safeSections.filter(
    (section) => section.healthStatus === 'Healthy'
  ).length;
  const warningSections = safeSections.filter(
    (section) => section.healthStatus === 'Moderate'
  ).length;
  const poorSections = safeSections.filter(
    (section) => section.healthStatus === 'Poor'
  ).length;
  const avgHealth =
    safeSections.reduce((sum, item) => sum + item.healthScore, 0) /
    totalSections;
  const avgGreen =
    safeSections.reduce((sum, item) => sum + item.greenPercentage, 0) /
    totalSections;
  const avgYellow =
    safeSections.reduce((sum, item) => sum + item.yellowPercentage, 0) /
    totalSections;
  const avgBrown =
    safeSections.reduce((sum, item) => sum + item.brownPercentage, 0) /
    totalSections;
  const excludedCount = sections.length - safeSections.length;
  const roundedHealthScore = Math.round(avgHealth);
  const roundedGreen = round1(avgGreen);
  const roundedYellow = round1(avgYellow);
  const harvestStatus = getHarvestStatus(
    roundedYellow,
    roundedGreen,
    roundedHealthScore
  );

  return {
    status: getStatusFromScore(roundedHealthScore),
    harvestReady: harvestStatus === 'Ready to Harvest',
    harvestStatus,
    healthScore: roundedHealthScore,
    green: roundedGreen,
    yellow: roundedYellow,
    brown: round1(avgBrown),
    totalSections,
    healthySections,
    warningSections,
    poorSections,
    selectedSectionId: safeSections[0]?.sectionLabel ?? null,
    gridEstimate:
      safeSections[0]?.gridRows && safeSections[0]?.gridCols
        ? `${safeSections[0].gridRows}x${safeSections[0].gridCols}`
        : null,
    interpretation: buildInterpretation(category, excludedCount),
    gridRows: safeSections[0]?.gridRows ?? null,
    gridCols: safeSections[0]?.gridCols ?? null,
    sections,
  };
}

function summarizeWholeFieldImageResults(imageResults) {
  const totalImages = imageResults.length;
  const avgHealth =
    imageResults.reduce((sum, item) => sum + item.healthScore, 0) / totalImages;
  const avgGreen =
    imageResults.reduce((sum, item) => sum + item.green, 0) / totalImages;
  const avgYellow =
    imageResults.reduce((sum, item) => sum + item.yellow, 0) / totalImages;
  const avgBrown =
    imageResults.reduce((sum, item) => sum + item.brown, 0) / totalImages;
  const totalSections = imageResults.reduce(
    (sum, item) => sum + (item.totalSections ?? 0),
    0
  );
  const healthySections = imageResults.reduce(
    (sum, item) => sum + (item.healthySections ?? 0),
    0
  );
  const warningSections = imageResults.reduce(
    (sum, item) => sum + (item.warningSections ?? 0),
    0
  );
  const poorSections = imageResults.reduce(
    (sum, item) => sum + (item.poorSections ?? 0),
    0
  );
  const harvestStatus = imageResults.some(
    (item) => item.harvestStatus === 'Needs Attention or Overripe'
  )
    ? 'Needs Attention or Overripe'
    : imageResults.some((item) => item.harvestStatus === 'Ready to Harvest')
      ? 'Ready to Harvest'
      : imageResults.some((item) => item.harvestStatus === 'Nearly Ready')
        ? 'Nearly Ready'
        : 'Not Ready';

  return {
    status: getStatusFromScore(Math.round(avgHealth)),
    harvestReady: harvestStatus === 'Ready to Harvest',
    harvestStatus,
    healthScore: Math.round(avgHealth),
    green: round1(avgGreen),
    yellow: round1(avgYellow),
    brown: round1(avgBrown),
    totalSections,
    healthySections,
    warningSections,
    poorSections,
    selectedSectionId: imageResults[0]?.selectedSectionId ?? null,
    gridEstimate: imageResults[0]?.gridEstimate ?? null,
    interpretation: `${imageResults.length} whole-field image${
      imageResults.length === 1 ? '' : 's'
    } analyzed individually. Use preview navigation to inspect each result.`,
    gridRows: imageResults[0]?.gridRows ?? null,
    gridCols: imageResults[0]?.gridCols ?? null,
    sections: imageResults[0]?.sections ?? [],
    imageResults,
  };
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: err.message,
    });
  }
});

app.patch('/api/images/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const { imageData, capturedAt } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'imageData is required' });
    }

    const result = await pool.query(
      `
      UPDATE plant_images
      SET image_data = $1,
          captured_at = COALESCE($2::timestamptz, captured_at)
      WHERE id = $3
      RETURNING *
      `,
      [imageData, capturedAt ?? null, imageId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update image error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analysis/save', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      category,
      flightHeightM,
      sourceType,
      notes,
      images,
      result,
    } = req.body;

    if (!category || !Array.isArray(images) || images.length === 0 || !result) {
      return res.status(400).json({
        error: 'category, images, and result are required',
      });
    }

    await client.query('BEGIN');

    // 1) create analysis batch
    const batchInsert = await client.query(
      `
      INSERT INTO analysis_batches (
        category,
        flight_height_m,
        source_type,
        notes
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        category,
        flightHeightM ?? null,
        sourceType ?? 'upload',
        notes ?? null,
      ]
    );

    const batch = batchInsert.rows[0];

    // 2) save uploaded images
    const savedImages = [];
    for (const [imageIndex, image] of images.entries()) {
      const imageInsert = await client.query(
        `
        INSERT INTO plant_images (
          batch_id,
          image_order,
          image_data,
          original_image_data,
          captured_at,
          source_type,
          drone_model,
          latitude,
          longitude,
          altitude
        )
        VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          batch.id,
          imageIndex,
          image.imageData ?? image.preview,
          image.originalPreview ?? image.imageData ?? image.preview,
          image.capturedAt ?? null,
          image.sourceType ?? sourceType ?? 'upload',
          image.droneModel ?? null,
          image.latitude ?? null,
          image.longitude ?? null,
          image.altitude ?? null,
        ]
      );

      savedImages.push(imageInsert.rows[0]);
    }

    // 3) save overall analysis result
    const resultInsert = await client.query(
      `
      INSERT INTO analysis_results (
        batch_id,
        health_status,
        health_score,
        green_percentage,
        yellow_percentage,
        brown_percentage,
        harvest_ready,
        recommendations,
        interpretation,
        total_sections,
        healthy_sections,
        warning_sections,
        poor_sections,
        grid_estimate,
        grid_rows,
        grid_cols,
        analysis_version,
        parent_analysis_result_id,
        analyzed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, now()
      )
      RETURNING *
      `,
      [
        batch.id,
        result.status,
        result.healthScore,
        result.green ?? 0,
        result.yellow ?? 0,
        result.brown ?? 0,
        result.harvestReady ?? false,
        result.recommendations ?? null,
        result.interpretation ?? null,
        result.totalSections ?? null,
        result.healthySections ?? null,
        result.warningSections ?? null,
        result.poorSections ?? null,
        result.gridEstimate ?? null,
        result.gridRows ?? null,
        result.gridCols ?? null,
        result.analysisVersion ?? 1,
        result.parentAnalysisResultId ?? null,
      ]
    );

    const savedResult = resultInsert.rows[0];

    // 4) save section-level analysis
    const savedSections = [];
    if (
      category === 'whole_field' &&
      Array.isArray(result.imageResults) &&
      result.imageResults.length > 0
    ) {
      for (const imageResult of result.imageResults) {
        const savedImage = savedImages[imageResult.imageIndex];
        const imageSections = Array.isArray(imageResult.sections)
          ? imageResult.sections
          : [];

        for (const section of imageSections) {
          const sectionInsert = await client.query(
            `
            INSERT INTO analysis_sections (
              analysis_result_id,
              plant_image_id,
              section_label,
              row_index,
              col_index,
              health_status,
              health_score,
              green_percentage,
              yellow_percentage,
              brown_percentage,
              recommendations,
              is_excluded,
              excluded_at,
              exclude_reason,
              parent_section_id,
              level,
              grid_rows,
              grid_cols
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
            `,
            [
              savedResult.id,
              savedImage?.id ?? null,
              section.sectionLabel,
              section.rowIndex ?? null,
              section.colIndex ?? null,
              section.healthStatus,
              section.healthScore,
              section.greenPercentage ?? 0,
              section.yellowPercentage ?? 0,
              section.brownPercentage ?? 0,
              section.recommendations ?? null,
              section.isExcluded ?? false,
              section.isExcluded ? new Date().toISOString() : null,
              section.excludeReason ?? null,
              section.parentSectionId ?? null,
              section.level ?? 1,
              imageResult.gridRows ?? section.gridRows ?? null,
              imageResult.gridCols ?? section.gridCols ?? null,
            ]
          );

          savedSections.push(sectionInsert.rows[0]);
        }
      }
    } else if (Array.isArray(result.sections) && result.sections.length > 0) {
      for (const section of result.sections) {
        const sectionInsert = await client.query(
          `
          INSERT INTO analysis_sections (
            analysis_result_id,
            plant_image_id,
            section_label,
            row_index,
            col_index,
            health_status,
            health_score,
            green_percentage,
            yellow_percentage,
            brown_percentage,
            recommendations,
            is_excluded,
            excluded_at,
            exclude_reason,
            parent_section_id,
            level,
            grid_rows,
            grid_cols
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          RETURNING *
          `,
          [
            savedResult.id,
            savedImages[0]?.id ?? null,
            section.sectionLabel,
            section.rowIndex ?? null,
            section.colIndex ?? null,
            section.healthStatus,
            section.healthScore,
            section.greenPercentage ?? 0,
            section.yellowPercentage ?? 0,
            section.brownPercentage ?? 0,
            section.recommendations ?? null,
            section.isExcluded ?? false,
            section.isExcluded ? new Date().toISOString() : null,
            section.excludeReason ?? null,
            section.parentSectionId ?? null,
            section.level ?? 1,
            section.gridRows ?? null,
            section.gridCols ?? null,
          ]
        );

        savedSections.push(sectionInsert.rows[0]);
      }
    }

    await client.query('COMMIT');

    res.json({
      batch,
      images: savedImages,
      analysisResult: savedResult,
      sections: savedSections,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save full analysis error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/analyses', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const batchResult = await pool.query(
      `
      SELECT
        ab.id AS batch_id,
        ab.category,
        ab.flight_height_m,
        ab.source_type,
        ab.notes,
        ab.created_at AS batch_created_at,

        ar.id AS analysis_result_id,
        ar.health_status,
        ar.health_score,
        ar.green_percentage,
        ar.yellow_percentage,
        ar.brown_percentage,
        ar.harvest_ready,
        ar.recommendations,
        ar.interpretation,
        ar.total_sections,
        ar.healthy_sections,
        ar.warning_sections,
        ar.poor_sections,
        ar.grid_estimate,
        ar.grid_rows,
        ar.grid_cols,
        ar.analysis_version,
        ar.parent_analysis_result_id,
        ar.analyzed_at

      FROM analysis_batches ab
      JOIN analysis_results ar ON ar.batch_id = ab.id
      ORDER BY ar.analyzed_at DESC
      LIMIT $1
      `,
      [limit]
    );

    const rows = batchResult.rows;

    const results = [];
    for (const row of rows) {
      const imagesRes = await pool.query(
        `
        SELECT *
        FROM plant_images
        WHERE batch_id = $1
        ORDER BY image_order ASC NULLS LAST, created_at ASC, id ASC
        `,
        [row.batch_id]
      );

      const sectionsRes = await pool.query(
        `
        SELECT *
        FROM analysis_sections
        WHERE analysis_result_id = $1
        ORDER BY level ASC, row_index ASC, col_index ASC
        `,
        [row.analysis_result_id]
      );

      results.push({
        id: row.batch_id,
        createdAt: row.batch_created_at,
        category: row.category,
        flightHeightM: row.flight_height_m
          ? Number(row.flight_height_m)
          : undefined,
        sourceType: row.source_type,
        notes: row.notes,
        images: imagesRes.rows.map((img) => ({
          id: img.id,
          file: null,
          imageOrder:
            typeof img.image_order === 'number'
              ? img.image_order
              : img.image_order != null
                ? Number(img.image_order)
                : undefined,
          preview: img.image_data,
          imageData: img.image_data,
          originalPreview: img.original_image_data ?? img.image_data,
          capturedAt: img.captured_at,
          sourceType: img.source_type,
          droneModel: img.drone_model,
          latitude: img.latitude ? Number(img.latitude) : undefined,
          longitude: img.longitude ? Number(img.longitude) : undefined,
          altitude: img.altitude ? Number(img.altitude) : undefined,
        })),
        result: (() => {
          const mappedSections = sectionsRes.rows.map((section) => ({
            id: section.id,
            plantImageId: section.plant_image_id,
            sectionLabel: section.section_label,
            rowIndex: section.row_index,
            colIndex: section.col_index,
            healthStatus: section.health_status,
            healthScore: section.health_score,
            greenPercentage: Number(section.green_percentage),
            yellowPercentage: Number(section.yellow_percentage),
            brownPercentage: Number(section.brown_percentage),
            recommendations: section.recommendations,
            isExcluded: section.is_excluded,
            excludeReason: section.exclude_reason,
            parentSectionId: section.parent_section_id,
            level: section.level,
            gridRows: section.grid_rows,
            gridCols: section.grid_cols,
          }));

          if (row.category === 'whole_field') {
            const hasImageLinkedSections = mappedSections.some(
              (section) => section.plantImageId
            );
            const imageResults = imagesRes.rows
              .map((img, imageIndex) => {
                const imageSections = hasImageLinkedSections
                  ? mappedSections.filter((section) => section.plantImageId === img.id)
                  : imageIndex === 0
                    ? mappedSections
                    : [];

                if (imageSections.length === 0) {
                  return null;
                }

                const summary = summarizeSections(imageSections, row.category);

                return {
                  ...summary,
                  imageIndex,
                  imageId: img.id,
                  imageLabel: `Whole Field ${imageIndex + 1}`,
                };
              })
              .filter(Boolean);

            if (imageResults.length > 0) {
              return {
                ...summarizeWholeFieldImageResults(imageResults),
                recommendations: row.recommendations,
                analysisVersion: row.analysis_version,
                parentAnalysisResultId: row.parent_analysis_result_id,
              };
            }
          }

          return {
            status: row.health_status,
            harvestReady: row.harvest_ready,
            harvestStatus: row.harvest_ready ? 'Ready to Harvest' : 'Not Ready',
            healthScore: row.health_score,
            green: Number(row.green_percentage),
            yellow: Number(row.yellow_percentage),
            brown: Number(row.brown_percentage),
            recommendations: row.recommendations,
            totalSections: row.total_sections,
            healthySections: row.healthy_sections,
            warningSections: row.warning_sections,
            poorSections: row.poor_sections,
            gridEstimate: row.grid_estimate,
            interpretation: row.interpretation,
            gridRows: row.grid_rows,
            gridCols: row.grid_cols,
            analysisVersion: row.analysis_version,
            parentAnalysisResultId: row.parent_analysis_result_id,
            sections: mappedSections,
          };
        })(),
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Fetch analyses error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/analyses/:batchId', async (req, res) => {
  const client = await pool.connect();

  try {
    const { batchId } = req.params;

    await client.query('BEGIN');

    const deleteResult = await client.query(
      `
      DELETE FROM analysis_batches
      WHERE id = $1
      RETURNING id
      `,
      [batchId]
    );

    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Analysis batch not found' });
    }

    await client.query('COMMIT');

    res.json({
      deleted: true,
      batchId: deleteResult.rows[0].id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete analysis batch error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/**
 * Update exclude/include state of one section
 */
app.patch('/api/analysis/sections/:sectionId/exclude', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const {
      isExcluded,
      excludeReason,
    } = req.body;

    if (typeof isExcluded !== 'boolean') {
      return res.status(400).json({
        error: 'isExcluded must be true or false',
      });
    }

    const result = await pool.query(
      `
      UPDATE analysis_sections
      SET
        is_excluded = $1,
        excluded_at = CASE WHEN $1 = true THEN now() ELSE NULL END,
        exclude_reason = CASE WHEN $1 = true THEN $2 ELSE NULL END
      WHERE id = $3
      RETURNING *
      `,
      [isExcluded, excludeReason ?? null, sectionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update section exclusion error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a re-analysis version based on an existing analysis_result_id
 * Useful later if you want to store multiple versions.
 */
app.post('/api/analysis/reanalyze', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      batchId,
      result,
    } = req.body;

    if (!batchId || !result) {
      return res.status(400).json({
        error: 'batchId and result are required',
      });
    }

    await client.query('BEGIN');

    const latestResultRes = await client.query(
      `
      SELECT *
      FROM analysis_results
      WHERE batch_id = $1
      ORDER BY analyzed_at DESC
      LIMIT 1
      `,
      [batchId]
    );

    const latestResult = latestResultRes.rows[0] ?? null;

    if (!latestResult) {
      return res.status(404).json({ error: 'Analysis result not found for batch' });
    }

    const resultUpdate = await client.query(
      `
      UPDATE analysis_results
      SET
        health_status = $1,
        health_score = $2,
        green_percentage = $3,
        yellow_percentage = $4,
        brown_percentage = $5,
        harvest_ready = $6,
        recommendations = $7,
        interpretation = $8,
        total_sections = $9,
        healthy_sections = $10,
        warning_sections = $11,
        poor_sections = $12,
        grid_estimate = $13,
        grid_rows = $14,
        grid_cols = $15,
        analyzed_at = now()
      WHERE id = $16
      RETURNING *
      `,
      [
        result.status,
        result.healthScore,
        result.green ?? 0,
        result.yellow ?? 0,
        result.brown ?? 0,
        result.harvestReady ?? false,
        result.recommendations ?? null,
        result.interpretation ?? null,
        result.totalSections ?? null,
        result.healthySections ?? null,
        result.warningSections ?? null,
        result.poorSections ?? null,
        result.gridEstimate ?? null,
        result.gridRows ?? null,
        result.gridCols ?? null,
        latestResult.id,
      ]
    );

    const savedResult = resultUpdate.rows[0];

    const imagesRes = await client.query(
      `
      SELECT *
      FROM plant_images
      WHERE batch_id = $1
      ORDER BY image_order ASC NULLS LAST, created_at ASC, id ASC
      `,
      [batchId]
    );

    await client.query(
      `
      DELETE FROM analysis_sections
      WHERE analysis_result_id = $1
      `,
      [savedResult.id]
    );

    const savedSections = [];

    if (Array.isArray(result.imageResults) && result.imageResults.length > 0) {
      for (const imageResult of result.imageResults) {
        const savedImage = imagesRes.rows[imageResult.imageIndex];
        const imageSections = Array.isArray(imageResult.sections)
          ? imageResult.sections
          : [];

        for (const section of imageSections) {
          const sectionInsert = await client.query(
            `
            INSERT INTO analysis_sections (
              analysis_result_id,
              plant_image_id,
              section_label,
              row_index,
              col_index,
              health_status,
              health_score,
              green_percentage,
              yellow_percentage,
              brown_percentage,
              recommendations,
              is_excluded,
              excluded_at,
              exclude_reason,
              parent_section_id,
              level,
              grid_rows,
              grid_cols
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
            `,
            [
              savedResult.id,
              savedImage?.id ?? null,
              section.sectionLabel,
              section.rowIndex ?? null,
              section.colIndex ?? null,
              section.healthStatus,
              section.healthScore,
              section.greenPercentage ?? 0,
              section.yellowPercentage ?? 0,
              section.brownPercentage ?? 0,
              section.recommendations ?? null,
              section.isExcluded ?? false,
              section.isExcluded ? new Date().toISOString() : null,
              section.excludeReason ?? null,
              section.parentSectionId ?? null,
              section.level ?? 1,
              imageResult.gridRows ?? section.gridRows ?? null,
              imageResult.gridCols ?? section.gridCols ?? null,
            ]
          );

          savedSections.push(sectionInsert.rows[0]);
        }
      }
    } else if (Array.isArray(result.sections) && result.sections.length > 0) {
      for (const section of result.sections) {
        const sectionInsert = await client.query(
          `
          INSERT INTO analysis_sections (
            analysis_result_id,
            plant_image_id,
            section_label,
            row_index,
            col_index,
            health_status,
            health_score,
            green_percentage,
            yellow_percentage,
            brown_percentage,
            recommendations,
            is_excluded,
            excluded_at,
            exclude_reason,
            parent_section_id,
            level,
            grid_rows,
            grid_cols
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          RETURNING *
          `,
          [
            savedResult.id,
            imagesRes.rows[0]?.id ?? null,
            section.sectionLabel,
            section.rowIndex ?? null,
            section.colIndex ?? null,
            section.healthStatus,
            section.healthScore,
            section.greenPercentage ?? 0,
            section.yellowPercentage ?? 0,
            section.brownPercentage ?? 0,
            section.recommendations ?? null,
            section.isExcluded ?? false,
            section.isExcluded ? new Date().toISOString() : null,
            section.excludeReason ?? null,
            section.parentSectionId ?? null,
            section.level ?? 1,
            section.gridRows ?? result.gridRows ?? null,
            section.gridCols ?? result.gridCols ?? null,
          ]
        );

        savedSections.push(sectionInsert.rows[0]);
      }
    }

    const savedSectionsRes = await client.query(
      `
      SELECT *
      FROM analysis_sections
      WHERE analysis_result_id = $1
      ORDER BY level ASC, row_index ASC, col_index ASC
      `,
      [savedResult.id]
    );

    await client.query('COMMIT');

    res.json({
      analysisResult: savedResult,
      sections: savedSections.length > 0 ? savedSections : savedSectionsRes.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reanalysis save error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3001;
await ensureOriginalImageColumn();
await ensureImageOrderColumn();

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn(
      'Warning: DATABASE_URL not set. Create server/.env with your PostgreSQL connection string.'
    );
  }
});

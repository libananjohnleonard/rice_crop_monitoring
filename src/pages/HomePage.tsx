import { useEffect, useState } from 'react';
import { HomeWorkspace } from '../components/HomeWorkspace';
import type { AnalysisInput } from '../components/UploadImages';
import type { AnalysisHistoryItem } from '../components/AnalysisResults';
import { supabase } from '../lib/supabaseClient';
import {
  analyzeBatchInBrowser,
  summarizeSectionsForReanalysis,
  summarizeWholeFieldImageResults,
} from '../lib/fieldAnalysis';

function currentStatusLabel(result?: AnalysisHistoryItem['result'] | null) {
  if (!result) return 'Waiting';
  const harvestStatus = result.harvestStatus ?? (result.harvestReady ? 'Ready to Harvest' : 'Not Ready');
  return `${result.status} - ${harvestStatus}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function getStatusFromScore(score: number) {
  if (score >= 75) return 'Healthy';
  if (score >= 55) return 'Moderate';
  return 'Poor';
}

function getHarvestStatus(yellowPercentage: number, greenPercentage: number, healthScore: number) {
  if (yellowPercentage >= 55 || (yellowPercentage >= 35 && healthScore < 45)) {
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

function buildInterpretation(category: string, excludedCount = 0) {
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

function summarizeSectionsLocal(
  sections: Array<any>,
  category: string
): AnalysisHistoryItem['result'] {
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
      selectedSectionId: sections[0]?.sectionLabel ?? undefined,
      gridEstimate:
        sections[0]?.gridRows && sections[0]?.gridCols
          ? `${sections[0].gridRows}x${sections[0].gridCols}`
          : undefined,
      interpretation: buildInterpretation(category, sections.length),
      gridRows: sections[0]?.gridRows ?? undefined,
      gridCols: sections[0]?.gridCols ?? undefined,
      sections,
    };
  }

  const totalSections = safeSections.length;
  const healthySections = safeSections.filter((section) => section.healthStatus === 'Healthy').length;
  const warningSections = safeSections.filter((section) => section.healthStatus === 'Moderate').length;
  const poorSections = safeSections.filter((section) => section.healthStatus === 'Poor').length;
  const avgHealth = safeSections.reduce((sum, item) => sum + item.healthScore, 0) / totalSections;
  const avgGreen =
    safeSections.reduce((sum, item) => sum + item.greenPercentage, 0) / totalSections;
  const avgYellow =
    safeSections.reduce((sum, item) => sum + item.yellowPercentage, 0) / totalSections;
  const avgBrown =
    safeSections.reduce((sum, item) => sum + item.brownPercentage, 0) / totalSections;
  const excludedCount = sections.length - safeSections.length;
  const roundedHealthScore = Math.round(avgHealth);
  const roundedGreen = round1(avgGreen);
  const roundedYellow = round1(avgYellow);
  const harvestStatus = getHarvestStatus(roundedYellow, roundedGreen, roundedHealthScore);

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
    selectedSectionId: safeSections[0]?.sectionLabel ?? undefined,
    gridEstimate:
      safeSections[0]?.gridRows && safeSections[0]?.gridCols
        ? `${safeSections[0].gridRows}x${safeSections[0].gridCols}`
        : undefined,
    interpretation: buildInterpretation(category, excludedCount),
    gridRows: safeSections[0]?.gridRows ?? undefined,
    gridCols: safeSections[0]?.gridCols ?? undefined,
    sections,
  };
}

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisHistoryItem | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);

  const fetchHistory = async () => {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured');
      }
      const { data: resultRows, error: resultError } = await supabase
        .from('analysis_results')
        .select(`
          id,
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
        `)
        .order('analyzed_at', { ascending: false })
        .limit(50);

      if (resultError) {
        throw resultError;
      }

      const data: AnalysisHistoryItem[] = [];
      for (const row of resultRows ?? []) {
        const { data: batch, error: batchError } = await supabase
          .from('analysis_batches')
          .select('*')
          .eq('id', row.batch_id)
          .maybeSingle();
        if (batchError) throw batchError;
        if (!batch?.id) continue;

        const { data: imagesRows, error: imagesError } = await supabase
          .from('plant_images')
          .select('*')
          .eq('batch_id', batch.id)
          .order('image_order', { ascending: true });
        if (imagesError) throw imagesError;

        const { data: sectionRows, error: sectionsError } = await supabase
          .from('analysis_sections')
          .select('*')
          .eq('analysis_result_id', row.id)
          .order('level', { ascending: true })
          .order('row_index', { ascending: true })
          .order('col_index', { ascending: true });
        if (sectionsError) throw sectionsError;

        const mappedImages = (imagesRows ?? []).map((img) => ({
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
        }));

        const mappedSections = (sectionRows ?? []).map((section) => ({
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

        let mappedResult: AnalysisHistoryItem['result'] = {
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

        if (batch.category === 'whole_field') {
          const hasImageLinkedSections = mappedSections.some((section) => section.plantImageId);
          const imageResults = mappedImages
            .map((img, imageIndex) => {
              const imageSections = hasImageLinkedSections
                ? mappedSections.filter((section) => section.plantImageId === img.id)
                : imageIndex === 0
                  ? mappedSections
                  : [];

              if (imageSections.length === 0) return null;

              const summary = summarizeSectionsLocal(imageSections, batch.category);
              return {
                ...summary,
                imageIndex,
                imageId: img.id,
                imageLabel: `Whole Field ${imageIndex + 1}`,
              };
            })
            .filter(Boolean) as NonNullable<AnalysisHistoryItem['result']['imageResults']>;

          if (imageResults.length > 0) {
            mappedResult = {
              ...summarizeWholeFieldImageResults(imageResults),
              recommendations: row.recommendations,
              analysisVersion: row.analysis_version,
              parentAnalysisResultId: row.parent_analysis_result_id,
            };
          }
        }

        data.push({
          id: batch.id,
          createdAt: batch.created_at,
          category: batch.category,
          flightHeightM: batch.flight_height_m ? Number(batch.flight_height_m) : undefined,
          sourceType: batch.source_type,
          notes: batch.notes,
          images: mappedImages,
          result: mappedResult,
        });
      }

      const mergedData = data.map((item) =>
        mergeOriginalPreviews(
          item,
          currentAnalysis?.id === item.id
            ? currentAnalysis
            : history.find((historyItem) => historyItem.id === item.id)
        )
      );

      setHistory(mergedData);

      if (mergedData.length > 0 && !currentAnalysis) {
        setCurrentAnalysis(mergedData[0]);
      }

      return mergedData;
    } catch (error) {
      console.error('Fetch history error:', error);
      return [];
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const saveAnalysis = async (
    payload: AnalysisInput,
    result: AnalysisHistoryItem['result']
  ) => {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { data: batch, error: batchError } = await supabase
      .from('analysis_batches')
      .insert({
        category: payload.category,
        flight_height_m: payload.flightHeightM ?? null,
        source_type: payload.sourceType ?? 'upload',
        notes: payload.notes ?? null,
      })
      .select('*')
      .single();
    if (batchError) throw batchError;

    const imagesPayload = payload.images.map((image, imageIndex) => ({
      batch_id: batch.id,
      image_order: imageIndex,
      image_data: image.imageData ?? image.preview,
      original_image_data: image.originalPreview ?? image.imageData ?? image.preview,
      captured_at: image.capturedAt ?? null,
      source_type: image.sourceType ?? payload.sourceType ?? 'upload',
      drone_model: image.droneModel ?? null,
      latitude: image.latitude ?? null,
      longitude: image.longitude ?? null,
      altitude: image.altitude ?? null,
    }));

    const { data: savedImages, error: imagesError } = await supabase
      .from('plant_images')
      .insert(imagesPayload)
      .select('*');
    if (imagesError) throw imagesError;

    const { data: savedResult, error: resultError } = await supabase
      .from('analysis_results')
      .insert({
        batch_id: batch.id,
        health_status: result.status,
        health_score: result.healthScore,
        green_percentage: result.green ?? 0,
        yellow_percentage: result.yellow ?? 0,
        brown_percentage: result.brown ?? 0,
        harvest_ready: result.harvestReady ?? false,
        recommendations: result.recommendations ?? null,
        interpretation: result.interpretation ?? null,
        total_sections: result.totalSections ?? null,
        healthy_sections: result.healthySections ?? null,
        warning_sections: result.warningSections ?? null,
        poor_sections: result.poorSections ?? null,
        grid_estimate: result.gridEstimate ?? null,
        grid_rows: result.gridRows ?? null,
        grid_cols: result.gridCols ?? null,
        analysis_version: result.analysisVersion ?? 1,
        parent_analysis_result_id: result.parentAnalysisResultId ?? null,
      })
      .select('*')
      .single();
    if (resultError) throw resultError;

    const sectionsPayload: Array<any> = [];
    if (payload.category === 'whole_field' && Array.isArray(result.imageResults)) {
      for (const imageResult of result.imageResults) {
        const savedImage = savedImages?.[imageResult.imageIndex];
        for (const section of imageResult.sections ?? []) {
          sectionsPayload.push({
            analysis_result_id: savedResult.id,
            plant_image_id: savedImage?.id ?? null,
            section_label: section.sectionLabel,
            row_index: section.rowIndex ?? null,
            col_index: section.colIndex ?? null,
            health_status: section.healthStatus,
            health_score: section.healthScore,
            green_percentage: section.greenPercentage ?? 0,
            yellow_percentage: section.yellowPercentage ?? 0,
            brown_percentage: section.brownPercentage ?? 0,
            recommendations: section.recommendations ?? null,
            is_excluded: section.isExcluded ?? false,
            excluded_at: section.isExcluded ? new Date().toISOString() : null,
            exclude_reason: section.excludeReason ?? null,
            parent_section_id: section.parentSectionId ?? null,
            level: section.level ?? 1,
            grid_rows: imageResult.gridRows ?? section.gridRows ?? null,
            grid_cols: imageResult.gridCols ?? section.gridCols ?? null,
          });
        }
      }
    } else {
      for (const section of result.sections ?? []) {
        sectionsPayload.push({
          analysis_result_id: savedResult.id,
          plant_image_id: savedImages?.[0]?.id ?? null,
          section_label: section.sectionLabel,
          row_index: section.rowIndex ?? null,
          col_index: section.colIndex ?? null,
          health_status: section.healthStatus,
          health_score: section.healthScore,
          green_percentage: section.greenPercentage ?? 0,
          yellow_percentage: section.yellowPercentage ?? 0,
          brown_percentage: section.brownPercentage ?? 0,
          recommendations: section.recommendations ?? null,
          is_excluded: section.isExcluded ?? false,
          excluded_at: section.isExcluded ? new Date().toISOString() : null,
          exclude_reason: section.excludeReason ?? null,
          parent_section_id: section.parentSectionId ?? null,
          level: section.level ?? 1,
          grid_rows: section.gridRows ?? null,
          grid_cols: section.gridCols ?? null,
        });
      }
    }

    if (sectionsPayload.length > 0) {
      const { error: sectionsError } = await supabase
        .from('analysis_sections')
        .insert(sectionsPayload);
      if (sectionsError) throw sectionsError;
    }

    return { batch };
  };

  const replaceImageAtIndex = (
    item: AnalysisHistoryItem,
    imageIndex: number,
    image: AnalysisHistoryItem['images'][number]
  ): AnalysisHistoryItem => ({
    ...item,
    images: item.images.map((currentImage, currentIndex) =>
      currentIndex === imageIndex ? image : currentImage
    ),
  });

  const mergeOriginalPreviews = (
    incoming: AnalysisHistoryItem,
    existing?: AnalysisHistoryItem | null
  ): AnalysisHistoryItem => ({
    ...incoming,
    images: incoming.images.map((image, index) => {
      const existingImage = existing?.images[index];

      return {
        ...image,
        originalPreview:
          image.originalPreview ??
          existingImage?.originalPreview ??
          existingImage?.imageData ??
          existingImage?.preview ??
          image.imageData ??
          image.preview,
      };
    }),
  });

  const handleAnalyze = async (payload: AnalysisInput) => {
    const result = await analyzeBatchInBrowser(payload);
    const saved = await saveAnalysis(payload, result);

    const refreshed = await fetchHistory();
    const savedItem = refreshed.find((item) => item.id === saved.batch.id);

    if (savedItem) {
      setCurrentAnalysis(savedItem);
    } else {
      const nextItem: AnalysisHistoryItem = {
        id: saved.batch.id,
        createdAt: saved.batch.created_at,
        category: payload.category,
        flightHeightM: payload.flightHeightM,
        sourceType: payload.sourceType,
        notes: payload.notes,
        images: payload.images,
        result,
      };

      setCurrentAnalysis(nextItem);
    }

    setRefreshKey((prev) => prev + 1);
  };

  const handleReanalyze = async ({
    excludedSections: excludedSectionLabels,
    imageIndex,
  }: {
    excludedSections: string[];
    imageIndex?: number;
  }) => {
    if (!currentAnalysis) return;

    let nextResult: AnalysisHistoryItem['result'];

    if (
      currentAnalysis.category === 'whole_field' &&
      Array.isArray(currentAnalysis.result.imageResults) &&
      typeof imageIndex === 'number'
    ) {
      const targetImage = currentAnalysis.images[imageIndex];

      if (!targetImage) {
        throw new Error('Whole-field image not found.');
      }

      const singleImageAnalysis = await analyzeBatchInBrowser({
        category: currentAnalysis.category,
        flightHeightM: currentAnalysis.flightHeightM,
        sourceType: currentAnalysis.sourceType,
        notes: currentAnalysis.notes,
        images: [targetImage],
      });

      const baseImageResult = singleImageAnalysis.imageResults?.[0];

      if (!baseImageResult) {
        throw new Error('Edited image analysis could not be generated.');
      }

      const nextImageResults = currentAnalysis.result.imageResults.map((item) => ({
        ...item,
      }));
      const includedSections = (baseImageResult.sections ?? []).filter(
        (section) => !excludedSectionLabels.includes(section.sectionLabel)
      );

      nextImageResults[imageIndex] =
        excludedSectionLabels.length > 0
          ? {
            ...baseImageResult,
            ...summarizeSectionsForReanalysis(
              { category: currentAnalysis.category },
              includedSections,
              {
                gridRows: baseImageResult.gridRows,
                gridCols: baseImageResult.gridCols,
                excludedCount: excludedSectionLabels.length,
              }
            ),
          }
          : baseImageResult;

      nextResult = summarizeWholeFieldImageResults(nextImageResults);
    } else {
      const targetImage = currentAnalysis.images[0];

      if (!targetImage) {
        throw new Error('Analysis image not found.');
      }

      const refreshedAnalysis = await analyzeBatchInBrowser({
        category: currentAnalysis.category,
        flightHeightM: currentAnalysis.flightHeightM,
        sourceType: currentAnalysis.sourceType,
        notes: currentAnalysis.notes,
        images: [targetImage],
      });

      if (excludedSectionLabels.length > 0) {
        const currentSections = refreshedAnalysis.sections ?? [];
        const includedSections = currentSections.filter(
          (section) => !excludedSectionLabels.includes(section.sectionLabel)
        );

        nextResult = summarizeSectionsForReanalysis(
          { category: currentAnalysis.category },
          includedSections,
          {
            gridRows: refreshedAnalysis.gridRows,
            gridCols: refreshedAnalysis.gridCols,
            excludedCount: excludedSectionLabels.length,
          }
        );
      } else {
        nextResult = refreshedAnalysis;
      }
    }

    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { data: latestResult, error: latestResultError } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('batch_id', currentAnalysis.id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResultError) throw latestResultError;
    if (!latestResult) {
      throw new Error('No saved analysis result found for this batch.');
    }

    const { data: savedResult, error: updateError } = await supabase
      .from('analysis_results')
      .update({
        health_status: nextResult.status,
        health_score: nextResult.healthScore,
        green_percentage: nextResult.green ?? 0,
        yellow_percentage: nextResult.yellow ?? 0,
        brown_percentage: nextResult.brown ?? 0,
        harvest_ready: nextResult.harvestReady ?? false,
        recommendations: nextResult.recommendations ?? null,
        interpretation: nextResult.interpretation ?? null,
        total_sections: nextResult.totalSections ?? null,
        healthy_sections: nextResult.healthySections ?? null,
        warning_sections: nextResult.warningSections ?? null,
        poor_sections: nextResult.poorSections ?? null,
        grid_estimate: nextResult.gridEstimate ?? null,
        grid_rows: nextResult.gridRows ?? null,
        grid_cols: nextResult.gridCols ?? null,
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', latestResult.id)
      .select('*')
      .single();
    if (updateError) throw updateError;

    const { data: imagesRows, error: imagesError } = await supabase
      .from('plant_images')
      .select('*')
      .eq('batch_id', currentAnalysis.id)
      .order('image_order', { ascending: true });
    if (imagesError) throw imagesError;

    const { error: deleteSectionsError } = await supabase
      .from('analysis_sections')
      .delete()
      .eq('analysis_result_id', savedResult.id);
    if (deleteSectionsError) throw deleteSectionsError;

    const sectionsPayload: Array<any> = [];
    if (Array.isArray(nextResult.imageResults) && nextResult.imageResults.length > 0) {
      for (const imageResult of nextResult.imageResults) {
        const savedImage = imagesRows?.[imageResult.imageIndex];
        for (const section of imageResult.sections ?? []) {
          sectionsPayload.push({
            analysis_result_id: savedResult.id,
            plant_image_id: savedImage?.id ?? null,
            section_label: section.sectionLabel,
            row_index: section.rowIndex ?? null,
            col_index: section.colIndex ?? null,
            health_status: section.healthStatus,
            health_score: section.healthScore,
            green_percentage: section.greenPercentage ?? 0,
            yellow_percentage: section.yellowPercentage ?? 0,
            brown_percentage: section.brownPercentage ?? 0,
            recommendations: section.recommendations ?? null,
            is_excluded: section.isExcluded ?? false,
            excluded_at: section.isExcluded ? new Date().toISOString() : null,
            exclude_reason: section.excludeReason ?? null,
            parent_section_id: section.parentSectionId ?? null,
            level: section.level ?? 1,
            grid_rows: imageResult.gridRows ?? section.gridRows ?? null,
            grid_cols: imageResult.gridCols ?? section.gridCols ?? null,
          });
        }
      }
    } else {
      for (const section of nextResult.sections ?? []) {
        sectionsPayload.push({
          analysis_result_id: savedResult.id,
          plant_image_id: imagesRows?.[0]?.id ?? null,
          section_label: section.sectionLabel,
          row_index: section.rowIndex ?? null,
          col_index: section.colIndex ?? null,
          health_status: section.healthStatus,
          health_score: section.healthScore,
          green_percentage: section.greenPercentage ?? 0,
          yellow_percentage: section.yellowPercentage ?? 0,
          brown_percentage: section.brownPercentage ?? 0,
          recommendations: section.recommendations ?? null,
          is_excluded: section.isExcluded ?? false,
          excluded_at: section.isExcluded ? new Date().toISOString() : null,
          exclude_reason: section.excludeReason ?? null,
          parent_section_id: section.parentSectionId ?? null,
          level: section.level ?? 1,
          grid_rows: section.gridRows ?? nextResult.gridRows ?? null,
          grid_cols: section.gridCols ?? nextResult.gridCols ?? null,
        });
      }
    }

    if (sectionsPayload.length > 0) {
      const { error: sectionsError } = await supabase
        .from('analysis_sections')
        .insert(sectionsPayload);
      if (sectionsError) throw sectionsError;
    }

    const refreshed = await fetchHistory();
    const updatedItem = refreshed.find((item) => item.id === currentAnalysis.id);

    if (updatedItem) {
      setCurrentAnalysis(updatedItem);
    }

    setRefreshKey((prev) => prev + 1);
  };

  const handleUpdateImage = async ({
    imageIndex,
    image,
  }: {
    imageIndex: number;
    image: AnalysisHistoryItem['images'][number];
  }) => {
    if (!currentAnalysis) return;

    const currentImage = currentAnalysis.images[imageIndex];

    if (!currentImage) {
      throw new Error('Image not found.');
    }

    if (currentImage.id) {
      if (!supabase) throw new Error('Supabase is not configured');
      const { error } = await supabase
        .from('plant_images')
        .update({
          image_data: image.imageData,
          captured_at: image.capturedAt ?? null,
        })
        .eq('id', currentImage.id);
      if (error) throw error;
    }

    const nextCurrentAnalysis = replaceImageAtIndex(currentAnalysis, imageIndex, {
      ...currentImage,
      ...image,
      id: currentImage.id ?? image.id,
      originalPreview:
        currentImage.originalPreview ?? currentImage.imageData ?? currentImage.preview,
    });

    setCurrentAnalysis(nextCurrentAnalysis);
    setHistory((currentHistory) =>
      currentHistory.map((item) =>
        item.id === currentAnalysis.id
          ? replaceImageAtIndex(item, imageIndex, {
            ...item.images[imageIndex],
            ...image,
            id: currentImage.id ?? image.id,
            originalPreview:
              item.images[imageIndex].originalPreview ??
              item.images[imageIndex].imageData ??
              item.images[imageIndex].preview,
          })
          : item
      )
    );
  };

  const handleClear = () => {
    setCurrentAnalysis(null);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-4 py-1">
      <section className="rounded-2xl border border-emerald-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Rice Monitoring
            </p>
            <h1 className="text-xl font-semibold text-emerald-950">
              Compact field analysis workspace
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[260px]">
            <div className="rounded-xl bg-emerald-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                History
              </p>
              <p className="text-sm font-semibold text-emerald-900">
                {history.length}
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                Current
              </p>
              <p className="truncate text-sm font-semibold text-emerald-900">
                {currentStatusLabel(currentAnalysis?.result)}
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                Category
              </p>
              <p className="truncate text-sm font-semibold text-emerald-900">
                {currentAnalysis ? currentAnalysis.category.replace('_', ' ') : '-'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <HomeWorkspace
        refreshKey={refreshKey}
        currentAnalysis={currentAnalysis}
        history={history}
        onAnalyze={handleAnalyze}
        onClear={handleClear}
        onReanalyze={handleReanalyze}
        onUpdateImage={handleUpdateImage}
        onSelectHistoryItem={setCurrentAnalysis}
      />
    </div>
  );
}

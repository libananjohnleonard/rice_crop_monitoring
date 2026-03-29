import type { AnalysisInput } from '../components/UploadImages';
import type {
  AnalysisHistoryItem,
  AnalysisResultDetails,
  SectionResult,
  WholeFieldImageResult,
} from '../components/AnalysisResults';

type RGB = { r: number; g: number; b: number };
type HSV = { h: number; s: number; v: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const diff = max - min;

  let h = 0;

  if (diff !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / diff) % 6;
        break;
      case gn:
        h = (bn - rn) / diff + 2;
        break;
      case bn:
        h = (rn - gn) / diff + 4;
        break;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return { h, s, v };
}

function classifyPixel({ r, g, b }: RGB): 'green' | 'yellow' | 'brown' | 'other' {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (v < 0.12 || s < 0.08) return 'other';

  if (h >= 55 && h <= 170 && g > r * 1.02 && g > b * 1.05) {
    return 'green';
  }

  if (
    h >= 35 &&
    h <= 75 &&
    r >= b * 1.05 &&
    g >= b * 1.05 &&
    Math.abs(r - g) <= 70
  ) {
    return 'yellow';
  }

  if (
    h >= 10 &&
    h <= 40 &&
    r > g &&
    g >= b &&
    v >= 0.15 &&
    v <= 0.85
  ) {
    return 'brown';
  }

  return 'other';
}

function getStatusFromScore(score: number): 'Healthy' | 'Moderate' | 'Poor' {
  if (score >= 75) return 'Healthy';
  if (score >= 55) return 'Moderate';
  return 'Poor';
}

function getRecommendation(status: 'Healthy' | 'Moderate' | 'Poor') {
  switch (status) {
    case 'Healthy':
      return 'Section condition is generally healthy. Continue regular monitoring.';
    case 'Moderate':
      return 'Section shows early stress. Check irrigation, nutrient balance, and pest signs.';
    case 'Poor':
      return 'Section needs attention. Inspect this area for disease, dryness, or severe discoloration.';
  }
}

function buildInterpretation(category: AnalysisInput['category'], excludedCount = 0) {
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

function sectionLabel(row: number, col: number) {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

/**
 * Whole Field:
 *   min: 4x5
 *   max: 6x6
 *
 * Partial Field:
 *   min: 2x2
 *   max: 4x4
 *
 * Close-up:
 *   1x1
 */
function pickGridSize(
  category: AnalysisInput['category'],
  width: number,
  height: number
): { rows: number; cols: number } {
  const aspectRatio = width / height;

  if (category === 'whole_field') {
    if (aspectRatio >= 1.6) {
      return { rows: 4, cols: 6 };
    }

    if (aspectRatio >= 1.25) {
      return { rows: 4, cols: 5 };
    }

    if (aspectRatio >= 0.9) {
      return { rows: 5, cols: 5 };
    }

    if (aspectRatio >= 0.72) {
      return { rows: 6, cols: 5 };
    }

    return { rows: 6, cols: 6 };
  }

  if (category === 'partial_field') {
    if (aspectRatio >= 1.6) {
      return { rows: 2, cols: 4 };
    }

    if (aspectRatio >= 1.2) {
      return { rows: 3, cols: 4 };
    }

    if (aspectRatio >= 0.9) {
      return { rows: 3, cols: 3 };
    }

    if (aspectRatio >= 0.72) {
      return { rows: 4, cols: 3 };
    }

    return { rows: 4, cols: 4 };
  }

  return { rows: 1, cols: 1 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function analyzeCanvasSection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imageData = ctx.getImageData(x, y, width, height);
  const { data } = imageData;

  let green = 0;
  let yellow = 0;
  let brown = 0;
  let considered = 0;

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    const result = classifyPixel({ r, g, b });

    if (result === 'green') {
      green++;
      considered++;
    } else if (result === 'yellow') {
      yellow++;
      considered++;
    } else if (result === 'brown') {
      brown++;
      considered++;
    } else {
      if (r + g + b > 60) considered++;
    }
  }

  const safeTotal = Math.max(considered, 1);

  const greenPercentage = round1((green / safeTotal) * 100);
  const yellowPercentage = round1((yellow / safeTotal) * 100);
  const brownPercentage = round1((brown / safeTotal) * 100);

  const rawScore =
    greenPercentage * 1.0 +
    yellowPercentage * 0.45 +
    brownPercentage * 0.1;

  const healthScore = Math.round(clamp(rawScore, 0, 100));
  const healthStatus = getStatusFromScore(healthScore);

  return {
    healthScore,
    healthStatus,
    greenPercentage,
    yellowPercentage,
    brownPercentage,
  };
}

async function analyzeSingleImage(
  category: AnalysisInput['category'],
  preview: string
): Promise<AnalysisResultDetails> {
  if (!preview) {
    throw new Error('No image available for analysis.');
  }

  const img = await loadImage(preview);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create canvas context.');
  }

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const { rows, cols } = pickGridSize(
    category,
    canvas.width,
    canvas.height
  );

  const cellWidth = Math.floor(canvas.width / cols);
  const cellHeight = Math.floor(canvas.height / rows);

  const sections: SectionResult[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellWidth;
      const y = row * cellHeight;

      const sectionWidth =
        col === cols - 1 ? canvas.width - x : cellWidth;
      const sectionHeight =
        row === rows - 1 ? canvas.height - y : cellHeight;

      const sectionResult = analyzeCanvasSection(
        ctx,
        x,
        y,
        sectionWidth,
        sectionHeight
      );

      sections.push({
        sectionLabel: sectionLabel(row, col),
        rowIndex: row,
        colIndex: col,
        healthStatus: sectionResult.healthStatus,
        healthScore: sectionResult.healthScore,
        greenPercentage: sectionResult.greenPercentage,
        yellowPercentage: sectionResult.yellowPercentage,
        brownPercentage: sectionResult.brownPercentage,
        recommendations: getRecommendation(sectionResult.healthStatus),
      });
    }
  }

  const totalSections = sections.length;
  const healthySections = sections.filter(
    (section) => section.healthStatus === 'Healthy'
  ).length;
  const warningSections = sections.filter(
    (section) => section.healthStatus === 'Moderate'
  ).length;
  const poorSections = sections.filter(
    (section) => section.healthStatus === 'Poor'
  ).length;

  const avgHealth =
    sections.reduce((sum, item) => sum + item.healthScore, 0) / totalSections;

  const avgGreen =
    sections.reduce((sum, item) => sum + item.greenPercentage, 0) / totalSections;

  const avgYellow =
    sections.reduce((sum, item) => sum + item.yellowPercentage, 0) / totalSections;

  const avgBrown =
    sections.reduce((sum, item) => sum + item.brownPercentage, 0) / totalSections;

  const overallStatus = getStatusFromScore(Math.round(avgHealth));
  const gridEstimate = `${rows}x${cols}`;

  if (category === 'whole_field') {
    return {
      status: overallStatus,
      healthScore: Math.round(avgHealth),
      green: round1(avgGreen),
      yellow: round1(avgYellow),
      brown: round1(avgBrown),
      totalSections,
      healthySections,
      warningSections,
      poorSections,
      selectedSectionId: sections[0]?.sectionLabel,
      gridEstimate,
      interpretation: buildInterpretation(category),
      gridRows: rows,
      gridCols: cols,
      sections,
    };
  }

  if (category === 'partial_field') {
    return {
      status: overallStatus,
      healthScore: Math.round(avgHealth),
      green: round1(avgGreen),
      yellow: round1(avgYellow),
      brown: round1(avgBrown),
      totalSections,
      healthySections,
      warningSections,
      poorSections,
      selectedSectionId: sections[0]?.sectionLabel,
      gridEstimate,
      interpretation: buildInterpretation(category),
      gridRows: rows,
      gridCols: cols,
      sections,
    };
  }

  const singleSection = sections[0];

  return {
    status: overallStatus,
    healthScore: Math.round(avgHealth),
    green: round1(avgGreen),
    yellow: round1(avgYellow),
    brown: round1(avgBrown),
    interpretation: buildInterpretation(category),
    gridRows: rows,
    gridCols: cols,
    sections: singleSection ? [singleSection] : [],
  };
}

export function summarizeWholeFieldImageResults(
  imageResults: WholeFieldImageResult[]
): AnalysisHistoryItem['result'] {
  if (imageResults.length === 0) {
    throw new Error('At least one whole-field image result is required.');
  }

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

  return {
    status: getStatusFromScore(Math.round(avgHealth)),
    healthScore: Math.round(avgHealth),
    green: round1(avgGreen),
    yellow: round1(avgYellow),
    brown: round1(avgBrown),
    totalSections,
    healthySections,
    warningSections,
    poorSections,
    selectedSectionId: imageResults[0]?.selectedSectionId,
    gridEstimate: imageResults[0]?.gridEstimate,
    interpretation: `${imageResults.length} whole-field image${
      imageResults.length === 1 ? '' : 's'
    } analyzed individually. Use preview navigation to inspect each result.`,
    gridRows: imageResults[0]?.gridRows,
    gridCols: imageResults[0]?.gridCols,
    sections: imageResults[0]?.sections,
    imageResults,
  };
}

export async function analyzeBatchInBrowser(
  input: AnalysisInput
): Promise<AnalysisHistoryItem['result']> {
  if (input.category === 'whole_field') {
    const imageResults = await Promise.all(
      input.images.map(async (image, imageIndex) => {
        const singleResult = await analyzeSingleImage(
          input.category,
          image.preview
        );

        return {
          ...singleResult,
          imageIndex,
          imageLabel: image.file?.name || `Whole Field ${imageIndex + 1}`,
        };
      })
    );

    return summarizeWholeFieldImageResults(imageResults);
  }

  return analyzeSingleImage(input.category, input.images[0]?.preview ?? '');
}

export function summarizeSectionsForReanalysis(
  input: Pick<AnalysisInput, 'category'>,
  sections: SectionResult[],
  options?: {
    gridRows?: number;
    gridCols?: number;
    excludedCount?: number;
  }
): AnalysisHistoryItem['result'] {
  if (sections.length === 0) {
    throw new Error('At least one included section is required for re-analysis.');
  }

  const totalSections = sections.length;
  const healthySections = sections.filter(
    (section) => section.healthStatus === 'Healthy'
  ).length;
  const warningSections = sections.filter(
    (section) => section.healthStatus === 'Moderate'
  ).length;
  const poorSections = sections.filter(
    (section) => section.healthStatus === 'Poor'
  ).length;

  const avgHealth =
    sections.reduce((sum, item) => sum + item.healthScore, 0) / totalSections;
  const avgGreen =
    sections.reduce((sum, item) => sum + item.greenPercentage, 0) / totalSections;
  const avgYellow =
    sections.reduce((sum, item) => sum + item.yellowPercentage, 0) / totalSections;
  const avgBrown =
    sections.reduce((sum, item) => sum + item.brownPercentage, 0) / totalSections;

  return {
    status: getStatusFromScore(Math.round(avgHealth)),
    healthScore: Math.round(avgHealth),
    green: round1(avgGreen),
    yellow: round1(avgYellow),
    brown: round1(avgBrown),
    totalSections,
    healthySections,
    warningSections,
    poorSections,
    selectedSectionId: sections[0]?.sectionLabel,
    gridEstimate:
      options?.gridRows && options?.gridCols
        ? `${options.gridRows}x${options.gridCols}`
        : undefined,
    interpretation: buildInterpretation(
      input.category,
      options?.excludedCount ?? 0
    ),
    gridRows: options?.gridRows,
    gridCols: options?.gridCols,
    sections,
  };
}

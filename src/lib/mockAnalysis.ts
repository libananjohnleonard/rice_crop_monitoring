import type { AnalysisInput } from '../components/UploadImages';
import type { AnalysisHistoryItem } from '../components/AnalysisResults';

export function createMockResult(
  input: AnalysisInput
): AnalysisHistoryItem['result'] {
  const imageCount = input.images.length;

  const baseScore =
    input.category === 'whole_field'
      ? 74
      : input.category === 'partial_field'
        ? 68
        : 81;

  const healthScore = Math.min(
    100,
    Math.max(35, baseScore + imageCount * 2 - (input.height ? input.height / 4 : 0))
  );

  const green =
    input.category === 'close_up'
      ? 78.4
      : input.category === 'partial_field'
        ? 64.2
        : 58.6;

  const yellow =
    input.category === 'close_up'
      ? 11.3
      : input.category === 'partial_field'
        ? 19.8
        : 21.2;

  const brown = Number((100 - green - yellow).toFixed(1));

  const status =
    healthScore >= 75 ? 'Healthy' : healthScore >= 55 ? 'Moderate' : 'Poor';

  if (input.category === 'whole_field') {
    return {
      status,
      healthScore: Math.round(healthScore),
      green,
      yellow,
      brown,
      totalSections: 16,
      healthySections: 10,
      warningSections: 4,
      poorSections: 2,
      selectedSectionId: 'A2',
      gridEstimate:
        input.height && input.height <= 5
          ? 'Fine'
          : input.height && input.height <= 15
            ? 'Medium'
            : input.height
              ? 'Wide'
              : 'Pending',
      interpretation:
        'Aerial upload was divided into sections for whole-field and per-section analysis.',
    };
  }

  if (input.category === 'partial_field') {
    return {
      status,
      healthScore: Math.round(healthScore),
      green,
      yellow,
      brown,
      interpretation:
        'This upload was analyzed as one focused field area without full grid division.',
    };
  }

  return {
    status,
    healthScore: Math.round(healthScore),
    green,
    yellow,
    brown,
    interpretation:
      'This upload was analyzed as a close-up plant image for visible plant condition.',
  };
}
export interface AnalysisResult {
  healthStatus: string;
  healthScore: number;
  greenPercentage: number;
  yellowPercentage: number;
  brownPercentage: number;
  harvestReady: boolean;
  recommendations: string;
}

export async function analyzeRicePlantImage(imageData: string): Promise<AnalysisResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(getDefaultAnalysis());
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageDataObj.data;

      let greenCount = 0;
      let yellowCount = 0;
      let brownCount = 0;
      let totalPixels = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        if (a < 128) continue;

        totalPixels++;

        if (isGreen(r, g, b)) {
          greenCount++;
        } else if (isYellow(r, g, b)) {
          yellowCount++;
        } else if (isBrown(r, g, b)) {
          brownCount++;
        }
      }

      const greenPercentage = (greenCount / totalPixels) * 100;
      const yellowPercentage = (yellowCount / totalPixels) * 100;
      const brownPercentage = (brownCount / totalPixels) * 100;

      const healthScore = calculateHealthScore(greenPercentage, yellowPercentage, brownPercentage);
      const healthStatus = getHealthStatus(healthScore);
      const harvestReady = isReadyForHarvest(yellowPercentage, greenPercentage, healthScore);
      const recommendations = generateRecommendations(healthStatus, harvestReady, greenPercentage, yellowPercentage, brownPercentage);

      resolve({
        healthStatus,
        healthScore,
        greenPercentage: Math.round(greenPercentage * 100) / 100,
        yellowPercentage: Math.round(yellowPercentage * 100) / 100,
        brownPercentage: Math.round(brownPercentage * 100) / 100,
        harvestReady,
        recommendations,
      });
    };

    img.onerror = () => {
      resolve(getDefaultAnalysis());
    };

    img.src = imageData;
  });
}

function isGreen(r: number, g: number, b: number): boolean {
  return g > r && g > b && g > 100;
}

function isYellow(r: number, g: number, b: number): boolean {
  return r > 150 && g > 150 && b < 150 && Math.abs(r - g) < 50;
}

function isBrown(r: number, g: number, b: number): boolean {
  return r > 100 && r < 200 && g > 50 && g < 150 && b < 100;
}

function calculateHealthScore(green: number, yellow: number, brown: number): number {
  let score = 0;

  score += green * 0.8;
  score += yellow * 0.5;
  score -= brown * 1.5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getHealthStatus(score: number): string {
  if (score >= 70) return 'Healthy';
  if (score >= 40) return 'Moderate';
  return 'Poor';
}

function isReadyForHarvest(yellow: number, green: number, score: number): boolean {
  return yellow > 15 && yellow > green * 0.3 && score > 50;
}

function generateRecommendations(
  status: string,
  harvestReady: boolean,
  green: number,
  yellow: number,
  brown: number
): string {
  const recommendations: string[] = [];

  if (harvestReady) {
    recommendations.push('Rice plants are showing signs of maturity and may be ready for harvest soon.');
  }

  if (status === 'Poor') {
    recommendations.push('Plants show signs of stress. Check for adequate water, nutrients, and pest control.');
  }

  if (brown > 20) {
    recommendations.push('High brown coloration detected. Investigate for diseases or nutrient deficiencies.');
  }

  if (green > 60 && status === 'Healthy') {
    recommendations.push('Plants are in excellent vegetative health. Continue current care regimen.');
  }

  if (yellow > 30 && !harvestReady) {
    recommendations.push('Yellowing detected. May indicate natural ripening or potential nutrient issues.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Plants appear normal. Continue monitoring growth and development.');
  }

  return recommendations.join(' ');
}

function getDefaultAnalysis(): AnalysisResult {
  return {
    healthStatus: 'Unknown',
    healthScore: 0,
    greenPercentage: 0,
    yellowPercentage: 0,
    brownPercentage: 0,
    harvestReady: false,
    recommendations: 'Unable to analyze image.',
  };
}

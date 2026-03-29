

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export interface PlantImage {
  id: string;
  image_data: string;
  captured_at: string;
  created_at: string;
}

export interface PlantAnalysis {
  id: string;
  image_id: string;
  health_status: string;
  health_score: number;
  green_percentage: number;
  yellow_percentage: number;
  brown_percentage: number;
  harvest_ready: boolean;
  recommendations: string;

  analyzed_at: string;
  created_at: string;
}

export async function insertPlantImage(image_data: string, captured_at?: string): Promise<PlantImage> {
  const response = await fetch('http://localhost:3001/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_data, captured_at }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save image');
  }
  return response.json();
}

// Insert plant analysis
export async function insertPlantAnalysis(data: {
  image_id: string;
  health_status: string;
  health_score: number;
  green_percentage: number;
  yellow_percentage: number;
  brown_percentage: number;
  harvest_ready: boolean;
  recommendations: string;
  analyzed_at?: string;
}): Promise<PlantAnalysis> {
  const response = await fetch('http://localhost:3001/api/analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save analysis');
  }
  const row = await response.json();
  return {
    ...row,
    health_score: toNumber(row.health_score),
    green_percentage: toNumber(row.green_percentage),
    yellow_percentage: toNumber(row.yellow_percentage),
    brown_percentage: toNumber(row.brown_percentage),
  };
}

// Fetch analyses with joined images
export async function fetchAnalyses(limit = 50): Promise<AnalysisWithImage[]> {
  const response = await fetch(`http://localhost:3001/api/analyses?limit=${limit}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch analyses');
  }
  const data = await response.json();
  return (data || []).map((row: any) => ({
    ...row,
    health_score: toNumber(row.health_score),
    green_percentage: toNumber(row.green_percentage),
    yellow_percentage: toNumber(row.yellow_percentage),
    brown_percentage: toNumber(row.brown_percentage),
  }));
}


export interface AnalysisWithImage extends PlantAnalysis {
  plant_images?: PlantImage;
}

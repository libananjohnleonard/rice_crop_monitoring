import { supabase } from './supabaseClient';



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
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('plant_images')
    .insert({ image_data, captured_at: captured_at ?? null })
    .select('id,image_data,captured_at,created_at')
    .single();
  if (error) throw error;
  return data;
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
  if (!supabase) throw new Error('Supabase is not configured');
  const { data: row, error } = await supabase
    .from('analysis_results')
    .insert(data)
    .select('*')
    .single();
  if (error) throw error;
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
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .order('analyzed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
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

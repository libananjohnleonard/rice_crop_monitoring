import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Pencil, Play, Upload, X } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { extractExifGpsData } from '../lib/exifGps';

export type UploadCategory = 'whole_field' | 'partial_field' | 'close_up';
export type UploadSourceType = 'upload' | 'wifi' | 'bluetooth' | 'webcam';

export type UploadImageItem = {
  id?: string;
  file: File | null;
  preview: string;
  imageData: string;
  originalPreview?: string;
  capturedAt?: string;
  sourceType?: UploadSourceType;
  droneModel?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
};

export type AnalysisInput = {
  category: UploadCategory;
  flightHeightM?: number;
  sourceType: UploadSourceType;
  notes?: string;
  images: UploadImageItem[];
};

type Props = {
  onAnalyze: (payload: AnalysisInput) => void | Promise<void>;
};

const CATEGORY_OPTIONS: {
  value: UploadCategory;
  label: string;
  hint: string;
}[] = [
  {
    value: 'whole_field',
    label: 'Whole Field',
    hint: 'Grid-based aerial analysis',
  },
  {
    value: 'partial_field',
    label: 'Partial Field',
    hint: 'Focused area analysis',
  },
  {
    value: 'close_up',
    label: 'Close-up',
    hint: 'Plant-level inspection',
  },
];

export function CameraCapture({ onAnalyze }: Props) {
  const [category, setCategory] = useState<UploadCategory | ''>('');
  const [images, setImages] = useState<UploadImageItem[]>([]);
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  const gridEstimate = useMemo(() => {
    if (category !== 'whole_field') return 'Not needed';
    return 'Auto';
  }, [category]);

  const selectedCategoryLabel = useMemo(() => {
    return (
      CATEGORY_OPTIONS.find((item) => item.value === category)?.label ||
      'Not selected'
    );
  }, [category]);

  const revokePreview = (preview: string) => {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
  };

  const revokeItems = (items: UploadImageItem[]) => {
    items.forEach((item) => revokePreview(item.preview));
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const appendFiles = async (fileList: FileList | null, replace = false) => {
    if (!fileList) return;

    const imageFiles = Array.from(fileList).filter((file) =>
      file.type.startsWith('image/')
    );

    const nextItems: UploadImageItem[] = await Promise.all(
      imageFiles.map(async (file) => {
        const [imageData, gpsMeta] = await Promise.all([
          readFileAsDataUrl(file),
          extractExifGpsData(file),
        ]);

        return {
          file,
          preview: URL.createObjectURL(file),
          imageData,
          originalPreview: imageData,
          capturedAt: gpsMeta.capturedAt ?? new Date().toISOString(),
          sourceType: 'upload' as const,
          latitude: gpsMeta.latitude,
          longitude: gpsMeta.longitude,
          altitude: gpsMeta.altitude,
        };
      })
    );

    setImages((prev) => {
      if (replace) {
        revokeItems(prev);
        return nextItems;
      }
      return [...prev, ...nextItems];
    });

    setError('');
  };

  const handleAnalyze = async () => {
    if (!category) {
      setError('Select a category first.');
      return;
    }

    if (images.length === 0) {
      setError('Upload at least one image.');
      return;
    }

    try {
      setError('');
      setIsAnalyzing(true);

      await onAnalyze({
        category,
        flightHeightM: undefined,
        sourceType: 'upload',
        notes: '',
        images,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const target = prev[index];
      if (target) revokePreview(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const editingImage =
    editingIndex !== null && images[editingIndex] ? images[editingIndex] : null;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
            Input
          </p>
          <p className="text-sm font-semibold text-emerald-900">
            Category and image upload
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
          {images.length} files
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-1">
        <div>
          <label className="mb-1 block text-sm font-medium text-emerald-900">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as UploadCategory | '')}
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">Select category</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {category && (
            <p className="mt-1 text-xs text-emerald-600">
              {CATEGORY_OPTIONS.find((item) => item.value === category)?.hint}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-3">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-4 py-6 text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <ImagePlus className="h-5 w-5" />
          </div>

          <p className="font-semibold text-emerald-900">Upload rice images</p>
          <p className="mt-1 text-xs text-emerald-600">
            Device upload or transferred images
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => batchInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Upload className="h-4 w-4" />
              New Batch
            </button>

            <button
              type="button"
              onClick={() => addInputRef.current?.click()}
              className="rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
            >
              Add More
            </button>
          </div>

          <input
            ref={batchInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void appendFiles(e.target.files, true);
              e.target.value = '';
            }}
          />

          <input
            ref={addInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void appendFiles(e.target.files, false);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-slate-50 p-3">
          <p className="text-xs text-emerald-600">Category</p>
          <p className="mt-1 font-semibold text-emerald-900">
            {selectedCategoryLabel}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-slate-50 p-3">
          <p className="text-xs text-emerald-600">Altitude Source</p>
          <p className="mt-1 font-semibold text-emerald-900">
            From image EXIF geotag
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-slate-50 p-3">
          <p className="text-xs text-emerald-600">
            {category === 'whole_field' ? 'Grid' : 'Images'}
          </p>
          <p className="mt-1 font-semibold text-emerald-900">
            {category === 'whole_field' ? gridEstimate : `${images.length} selected`}
          </p>
        </div>
      </div>

      {images.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-900">
              Selected Images
            </h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {images.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {images.map((img, index) => (
              (() => {
                const displayName = img.file?.name || `Image ${index + 1}`;

                return (
              <div
                key={`${displayName}-${index}`}
                className="overflow-hidden rounded-xl border border-emerald-100 bg-slate-50"
              >
                <div className="flex h-28 items-center justify-center bg-slate-100 p-2">
                  <img
                    src={img.preview}
                    alt={displayName}
                    className="max-h-full w-full rounded-lg object-contain"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <p className="truncate text-xs text-emerald-800">
                    {displayName}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingIndex(index)}
                      className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50"
                      title="Edit image"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="rounded-md p-1 text-red-600 hover:bg-red-50"
                      title="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
                );
              })()
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Play className="h-4 w-4" />
        {isAnalyzing ? 'Analyzing...' : 'Analyze Selected Images'}
      </button>

      {editingImage && (
        <ImageEditorModal
          open
          imageSrc={editingImage.imageData || editingImage.preview}
          originalImageSrc={editingImage.originalPreview || editingImage.imageData || editingImage.preview}
          fileName={editingImage.file?.name || `edited-image-${editingIndex ?? 0}.png`}
          title={`Edit ${editingImage.file?.name || 'Image'}`}
          currentImageIndex={editingIndex ?? 0}
          totalImages={images.length}
          onPrevImage={() =>
            setEditingIndex((current) =>
              current !== null && current > 0 ? current - 1 : current
            )
          }
          onNextImage={() =>
            setEditingIndex((current) =>
              current !== null && current < images.length - 1 ? current + 1 : current
            )
          }
          onClose={() => setEditingIndex(null)}
          onSave={async ({ imageData, preview, file }) => {
            setImages((current) =>
              current.map((image, index) => {
                if (index !== editingIndex) return image;

                revokePreview(image.preview);

                return {
                  ...image,
                  file,
                  imageData,
                  preview,
                  originalPreview: image.originalPreview ?? image.imageData,
                };
              })
            );
            setEditingIndex(null);
          }}
        />
      )}
    </div>
  );
}

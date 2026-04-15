export type ImageEditSettings = {
  rotation: number;
  crop: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type BrushPoint = {
  x: number;
  y: number;
};

export type BrushStroke = {
  size: number;
  points: BrushPoint[];
};

export type SelectionBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type InclusionRegion = {
  id: string;
  points: BrushPoint[];
};

export const EXCLUSION_MASK_COLOR = '#00ffff';

export const DEFAULT_IMAGE_EDITS: ImageEditSettings = {
  rotation: 0,
  crop: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function isDefaultImageEdits(edits: ImageEditSettings) {
  return (
    Math.abs(edits.rotation) < 0.000001 &&
    edits.crop.top === 0 &&
    edits.crop.right === 0 &&
    edits.crop.bottom === 0 &&
    edits.crop.left === 0
  );
}

export async function applyImageEdits(
  src: string,
  edits: ImageEditSettings
): Promise<string> {
  if (!src) {
    throw new Error('No image source provided.');
  }

  const image = await loadImage(src);
  const angle = (edits.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const rotatedWidth = Math.ceil(
    Math.abs(sourceWidth * cos) + Math.abs(sourceHeight * sin)
  );
  const rotatedHeight = Math.ceil(
    Math.abs(sourceWidth * sin) + Math.abs(sourceHeight * cos)
  );

  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = rotatedWidth;
  rotatedCanvas.height = rotatedHeight;

  const rotatedContext = rotatedCanvas.getContext('2d');

  if (!rotatedContext) {
    throw new Error('Could not create image editor canvas.');
  }

  // Fill rotated canvas first so empty corners become white instead of transparent/black.
  rotatedContext.fillStyle = '#ffffff';
  rotatedContext.fillRect(0, 0, rotatedWidth, rotatedHeight);
  rotatedContext.imageSmoothingEnabled = true;
  rotatedContext.imageSmoothingQuality = 'high';
  rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
  rotatedContext.rotate(angle);
  rotatedContext.drawImage(
    image,
    -sourceWidth / 2,
    -sourceHeight / 2
  );

  const cropLeft = Math.floor((rotatedWidth * edits.crop.left) / 100);
  const cropRight = Math.floor((rotatedWidth * edits.crop.right) / 100);
  const cropTop = Math.floor((rotatedHeight * edits.crop.top) / 100);
  const cropBottom = Math.floor((rotatedHeight * edits.crop.bottom) / 100);

  const outputWidth = Math.max(1, rotatedWidth - cropLeft - cropRight);
  const outputHeight = Math.max(1, rotatedHeight - cropTop - cropBottom);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  const outputContext = outputCanvas.getContext('2d');

  if (!outputContext) {
    throw new Error('Could not create output canvas.');
  }

  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, outputWidth, outputHeight);
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(
    rotatedCanvas,
    cropLeft,
    cropTop,
    outputWidth,
    outputHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return outputCanvas.toDataURL('image/png');
}

export async function applyExclusionMask(
  src: string,
  strokes: BrushStroke[]
): Promise<string> {
  if (!src) {
    throw new Error('No image source provided.');
  }

  if (strokes.length === 0) {
    return src;
  }

  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create mask canvas.');
  }

  context.drawImage(image, 0, 0);
  context.strokeStyle = EXCLUSION_MASK_COLOR;
  context.fillStyle = EXCLUSION_MASK_COLOR;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  strokes.forEach((stroke) => {
    if (stroke.points.length === 0) return;

    const pixelSize = Math.max(
      1,
      (stroke.size / 100) * Math.max(canvas.width, canvas.height)
    );

    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.beginPath();
      context.arc(
        point.x * canvas.width,
        point.y * canvas.height,
        pixelSize / 2,
        0,
        Math.PI * 2
      );
      context.fill();
      return;
    }

    context.beginPath();
    context.lineWidth = pixelSize;
    context.moveTo(
      stroke.points[0].x * canvas.width,
      stroke.points[0].y * canvas.height
    );

    stroke.points.slice(1).forEach((point) => {
      context.lineTo(point.x * canvas.width, point.y * canvas.height);
    });

    context.stroke();
  });

  return canvas.toDataURL('image/png');
}

export async function applyInclusionRegions(
  src: string,
  regions: InclusionRegion[]
): Promise<string> {
  if (!src) {
    throw new Error('No image source provided.');
  }

  if (regions.length === 0) {
    return src;
  }

  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create inclusion canvas.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  regions.forEach((region) => {
    if (region.points.length < 3) return;

    context.save();
    context.beginPath();
    context.moveTo(
      region.points[0].x * canvas.width,
      region.points[0].y * canvas.height
    );

    region.points.slice(1).forEach((point) => {
      context.lineTo(point.x * canvas.width, point.y * canvas.height);
    });

    context.closePath();
    context.clip();
    context.drawImage(image, 0, 0);
    context.restore();
  });

  return canvas.toDataURL('image/png');
}

export async function applyExclusionBoxes(
  src: string,
  boxes: SelectionBox[]
): Promise<string> {
  if (!src) {
    throw new Error('No image source provided.');
  }

  if (boxes.length === 0) {
    return src;
  }

  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create exclusion box canvas.');
  }

  context.drawImage(image, 0, 0);
  context.fillStyle = EXCLUSION_MASK_COLOR;

  boxes.forEach((box) => {
    const pixelBox = toPixelBox(box, canvas.width, canvas.height);
    if (pixelBox.width <= 0 || pixelBox.height <= 0) return;

    context.fillRect(pixelBox.x, pixelBox.y, pixelBox.width, pixelBox.height);
  });

  return canvas.toDataURL('image/png');
}

export async function softenExclusionMaskPreview(src: string): Promise<string> {
  if (!src) {
    throw new Error('No image source provided.');
  }

  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create preview canvas.');
  }

  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const maskColor = hexToRgb(EXCLUSION_MASK_COLOR);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    const isMaskPixel =
      Math.abs(r - maskColor.r) <= 8 &&
      Math.abs(g - maskColor.g) <= 8 &&
      Math.abs(b - maskColor.b) <= 8;

    if (!isMaskPixel) continue;

    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 72;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function dataUrlToFile(dataUrl: string, fileName: string) {
  const [header, content] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] ?? 'image/png';
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toPixelBox(
  box: SelectionBox,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = Math.max(0, Math.min(canvasWidth, Math.round(box.x * canvasWidth)));
  const y = Math.max(0, Math.min(canvasHeight, Math.round(box.y * canvasHeight)));
  const right = Math.max(
    x,
    Math.min(canvasWidth, Math.round((box.x + box.width) * canvasWidth))
  );
  const bottom = Math.max(
    y,
    Math.min(canvasHeight, Math.round((box.y + box.height) * canvasHeight))
  );

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

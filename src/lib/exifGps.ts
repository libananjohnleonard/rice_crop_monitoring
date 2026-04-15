export type ExifGpsData = {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  capturedAt?: string;
};

function decodeAscii(view: DataView, offset: number, count: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = offset + i;
    if (index >= view.byteLength) break;
    const value = view.getUint8(index);
    if (value === 0) break;
    bytes.push(value);
  }

  return String.fromCharCode(...bytes).trim();
}

function formatExifDateTime(raw?: string): string | undefined {
  if (!raw) return undefined;

  const match = raw.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
  );

  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getTypeByteSize(type: number): number {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
    case 9:
      return 4;
    case 5:
    case 10:
      return 8;
    default:
      return 0;
  }
}

function readUnsignedRational(
  view: DataView,
  offset: number,
  littleEndian: boolean
): number | undefined {
  if (offset + 8 > view.byteLength) return undefined;

  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);

  if (denominator === 0) return undefined;

  return numerator / denominator;
}

function readRationalArray(
  view: DataView,
  offset: number,
  count: number,
  littleEndian: boolean
): number[] {
  const values: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const value = readUnsignedRational(view, offset + i * 8, littleEndian);
    if (typeof value !== 'number') return [];
    values.push(value);
  }

  return values;
}

function toDecimalDegrees(
  dms: number[],
  ref?: string
): number | undefined {
  if (dms.length !== 3) return undefined;

  const [degrees, minutes, seconds] = dms;
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;

  return sign * (degrees + minutes / 60 + seconds / 3600);
}

type IfdEntry = {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
};

function readIfdEntries(
  view: DataView,
  ifdOffset: number,
  tiffStart: number,
  littleEndian: boolean
): IfdEntry[] {
  const absoluteOffset = tiffStart + ifdOffset;
  if (absoluteOffset + 2 > view.byteLength) return [];

  const entryCount = view.getUint16(absoluteOffset, littleEndian);
  const entries: IfdEntry[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = absoluteOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOrOffset = view.getUint32(entryOffset + 8, littleEndian);
    const valueByteSize = getTypeByteSize(type) * count;

    const valueOffset =
      valueByteSize > 4 ? tiffStart + valueOrOffset : entryOffset + 8;

    entries.push({
      tag,
      type,
      count,
      valueOffset,
    });
  }

  return entries;
}

export async function extractExifGpsData(file: File): Promise<ExifGpsData> {
  const mime = file.type.toLowerCase();
  if (mime && !mime.includes('jpeg') && !mime.includes('jpg')) {
    return {};
  }

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    if (view.byteLength < 4) return {};
    if (view.getUint16(0, false) !== 0xffd8) return {};

    let exifStart = -1;
    let offset = 2;

    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;

      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;

      const segmentLength = view.getUint16(offset + 2, false);
      const segmentStart = offset + 4;

      if (
        marker === 0xe1 &&
        segmentStart + 6 <= view.byteLength &&
        decodeAscii(view, segmentStart, 4) === 'Exif'
      ) {
        exifStart = segmentStart + 6;
        break;
      }

      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }

    if (exifStart < 0 || exifStart + 8 > view.byteLength) return {};

    const endian = decodeAscii(view, exifStart, 2);
    const littleEndian = endian === 'II';
    if (!littleEndian && endian !== 'MM') return {};

    const tiffMagic = view.getUint16(exifStart + 2, littleEndian);
    if (tiffMagic !== 42) return {};

    const firstIfdOffset = view.getUint32(exifStart + 4, littleEndian);
    const primaryIfd = readIfdEntries(view, firstIfdOffset, exifStart, littleEndian);

    const gpsIfdPointer = primaryIfd.find((entry) => entry.tag === 0x8825);
    const exifIfdPointer = primaryIfd.find((entry) => entry.tag === 0x8769);
    const dateTimeOriginalEntry = exifIfdPointer
      ? readIfdEntries(
          view,
          view.getUint32(exifIfdPointer.valueOffset, littleEndian),
          exifStart,
          littleEndian
        ).find((entry) => entry.tag === 0x9003)
      : undefined;
    const dateTimeEntry = primaryIfd.find((entry) => entry.tag === 0x0132);

    const capturedAt = formatExifDateTime(
      dateTimeOriginalEntry
        ? decodeAscii(view, dateTimeOriginalEntry.valueOffset, dateTimeOriginalEntry.count)
        : dateTimeEntry
          ? decodeAscii(view, dateTimeEntry.valueOffset, dateTimeEntry.count)
          : undefined
    );

    if (!gpsIfdPointer) {
      return capturedAt ? { capturedAt } : {};
    }

    const gpsIfdOffset = view.getUint32(gpsIfdPointer.valueOffset, littleEndian);
    const gpsEntries = readIfdEntries(view, gpsIfdOffset, exifStart, littleEndian);

    const latRefEntry = gpsEntries.find((entry) => entry.tag === 0x0001);
    const latEntry = gpsEntries.find((entry) => entry.tag === 0x0002);
    const lonRefEntry = gpsEntries.find((entry) => entry.tag === 0x0003);
    const lonEntry = gpsEntries.find((entry) => entry.tag === 0x0004);
    const altRefEntry = gpsEntries.find((entry) => entry.tag === 0x0005);
    const altEntry = gpsEntries.find((entry) => entry.tag === 0x0006);

    const latitude = latEntry
      ? toDecimalDegrees(
          readRationalArray(view, latEntry.valueOffset, latEntry.count, littleEndian),
          latRefEntry
            ? decodeAscii(view, latRefEntry.valueOffset, latRefEntry.count).toUpperCase()
            : undefined
        )
      : undefined;

    const longitude = lonEntry
      ? toDecimalDegrees(
          readRationalArray(view, lonEntry.valueOffset, lonEntry.count, littleEndian),
          lonRefEntry
            ? decodeAscii(view, lonRefEntry.valueOffset, lonRefEntry.count).toUpperCase()
            : undefined
        )
      : undefined;

    const altitudeRaw = altEntry
      ? readUnsignedRational(view, altEntry.valueOffset, littleEndian)
      : undefined;
    const altitudeRef = altRefEntry
      ? view.getUint8(altRefEntry.valueOffset)
      : 0;
    const altitude =
      typeof altitudeRaw === 'number'
        ? altitudeRef === 1
          ? -altitudeRaw
          : altitudeRaw
        : undefined;

    return {
      capturedAt,
      latitude,
      longitude,
      altitude,
    };
  } catch {
    return {};
  }
}

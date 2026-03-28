import sampleImageUrl from '../assets/mock/sample-image.jpg';

let base64Cache: string | null = null;

function loadHtmlImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode mock image.'));
    image.src = source;
  });
}

async function blobToNormalizedPngDataUrl(blob: Blob) {
  // Decode through browser image pipeline to avoid corrupted direct base64 conversions.
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadHtmlImage(objectUrl);

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) {
      throw new Error('Mock image has invalid dimensions.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // Draw via canvas and export as PNG data URL for stable rendering in Fabric.
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create canvas context for mock image conversion.');
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default {
  async getBase64Image() {
    try {
      // Reuse in-memory data URL to avoid repeated fetch/decode work.
      if (base64Cache) {
        return base64Cache;
      }

      const response = await fetch(sampleImageUrl);
      if (!response.ok) {
        throw new Error(`Could not load mock image (${response.status}).`);
      }

      const blob = await response.blob();
      base64Cache = await blobToNormalizedPngDataUrl(blob);
      return base64Cache;
    } catch (error) {
      throw new Error(`Can't load mock image as base64: ${String(error)}`);
    }
  },

  clearCache() {
    // Explicitly reset cache when caller wants to reload mock image from disk.
    base64Cache = null;
  },
};

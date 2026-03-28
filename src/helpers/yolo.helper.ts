import type { AnnotationBox } from 'src/interfaces/Annotation';

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function parseYoloLabels(raw: string): AnnotationBox[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // YOLO line format: class x_center y_center width height (normalized 0..1).
      const [classPart, xCenterPart, yCenterPart, widthPart, heightPart] = line.split(/\s+/);

      const classId = Number.parseInt(classPart, 10);
      const xCenter = Number.parseFloat(xCenterPart);
      const yCenter = Number.parseFloat(yCenterPart);
      const width = Number.parseFloat(widthPart);
      const height = Number.parseFloat(heightPart);

      if (
        !Number.isFinite(classId) ||
        !Number.isFinite(xCenter) ||
        !Number.isFinite(yCenter) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return null;
      }

      const x = clamp01(xCenter - width / 2);
      const y = clamp01(yCenter - height / 2);

      return {
        classId,
        x,
        y,
        width: Math.max(0.001, Math.min(width, 1 - x)),
        height: Math.max(0.001, Math.min(height, 1 - y)),
      } as AnnotationBox;
    })
    .filter((box): box is AnnotationBox => box !== null);
}

export function serializeYoloLabels(items: AnnotationBox[]) {
  return items
    .map((box) => {
      // Convert top-left representation back to YOLO center format.
      const xCenter = box.x + box.width / 2;
      const yCenter = box.y + box.height / 2;
      return `${box.classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${box.width.toFixed(6)} ${box.height.toFixed(6)}`;
    })
    .join('\n');
}

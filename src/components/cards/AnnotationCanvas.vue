<template>
  <div ref="viewportRef" class="annotation-viewport" @contextmenu.prevent>
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Canvas, FabricImage, FabricText, Point, Rect } from 'fabric';
import type { FabricObject, ObjectEvents, RectProps, SerializedRectProps } from 'fabric';

import type { AnnotationBox } from 'src/interfaces/Annotation';

// Component API: image + box data from store, and color/name resolvers from class config.
const props = defineProps<{
  imageSrc: string;
  boxes: AnnotationBox[];
  selectedBoxIndex: number;
  selectedClassId: number;
  classColor: (classId: number) => string;
  className: (classId: number) => string;
}>();

// Update events for two-way sync with the parent page/store.
const emit = defineEmits<{
  (event: 'update:boxes', value: AnnotationBox[]): void;
  (event: 'update:selectedBoxIndex', value: number): void;
  (event: 'update:selectedClassId', value: number): void;
  (event: 'image-load-failed', value: string): void;
}>();

type AnyRect = Rect<Partial<RectProps>, SerializedRectProps, ObjectEvents>;

const viewportRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const fabricCanvas = shallowRef<Canvas | null>(null);
const backgroundImage = shallowRef<FabricImage | null>(null);

// Metadata maps for per-rect class and per-rect class label text.
const rectClassMap = new WeakMap<AnyRect, number>();
const rectLabelMap = new WeakMap<AnyRect, FabricText>();

// Runtime interaction state.
const isApplyingProps = ref(false);
const isPanning = ref(false);
const panPoint = ref<{ x: number; y: number } | null>(null);
const drawingRect = shallowRef<AnyRect | null>(null);
const drawingStart = ref<Point | null>(null);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initCanvas();
  window.addEventListener('keydown', onGlobalKeydown);

  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      void loadImage();
    });
    resizeObserver.observe(viewportRef.value);
  }

  void loadImage();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (fabricCanvas.value) {
    void fabricCanvas.value.dispose();
    fabricCanvas.value = null;
  }
});

// Reload image when frame changes.
watch(
  () => props.imageSrc,
  () => {
    void loadImage();
  }
);

// Redraw canvas objects when external box list changes.
watch(
  () => props.boxes,
  () => {
    if (isApplyingProps.value) {
      return;
    }

    drawBoxesFromProps();
  },
  { deep: true }
);

// Recolor active object when class selection changes in UI.
watch(
  () => props.selectedClassId,
  (classId) => {
    const canvas = fabricCanvas.value;
    if (!canvas) {
      return;
    }

    const active = canvas.getActiveObject();
    if (!(active instanceof Rect)) {
      return;
    }

    setRectClass(active, classId);
    styleRect(active, classId);
    syncRectLabel(active, canvas);
    canvas.requestRenderAll();
    emitBoxesFromCanvas();
  }
);

// Sync selection from right-hand list into canvas.
watch(
  () => props.selectedBoxIndex,
  () => {
    syncSelectedRectFromProps();
  }
);

function initCanvas() {
  if (!canvasRef.value) {
    return;
  }

  const canvas = new Canvas(canvasRef.value, {
    selection: false,
    preserveObjectStacking: true,
    stopContextMenu: true,
    uniformScaling: false,
  });

  fabricCanvas.value = canvas;

  // Mouse wheel zoom with clamped pan boundaries.
  canvas.on('mouse:wheel', (opt) => {
    const event = opt.e;
    let zoom = canvas.getZoom();
    zoom *= event.deltaY < 0 ? 1.1 : 0.9;
    zoom = clamp(zoom, 1, 8);

    canvas.zoomToPoint(new Point(event.offsetX, event.offsetY), zoom);
    clampViewportTransform(canvas);
    canvas.requestRenderAll();
    event.preventDefault();
    event.stopPropagation();
  });

  // Left-click draws/selects, right-click drags the viewport.
  canvas.on('mouse:down', (opt) => {
    const event = opt.e as MouseEvent;

    if (event.button === 2) {
      isPanning.value = true;
      panPoint.value = { x: event.clientX, y: event.clientY };
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (opt.target instanceof Rect) {
      emitSelectionStateFromActiveObject();
      return;
    }

    startDrawingRect(canvas, event);
  });

  canvas.on('mouse:move', (opt) => {
    const event = opt.e as MouseEvent;

    if (isPanning.value && panPoint.value) {
      panViewport(canvas, event);
      return;
    }

    updateDrawingRect(canvas, event);
  });

  canvas.on('mouse:up', () => {
    isPanning.value = false;
    panPoint.value = null;
    finishDrawingRect(canvas);
  });

  // Keep moved/scaled objects inside image bounds.
  canvas.on('object:moving', (opt) => {
    if (!(opt.target instanceof Rect)) {
      return;
    }

    constrainRectPositionToImageBounds(opt.target, canvas);
    syncRectLabel(opt.target, canvas);
  });

  canvas.on('object:scaling', (opt) => {
    if (!(opt.target instanceof Rect)) {
      return;
    }

    constrainScaledRectToImageBounds(opt.target, canvas);
    syncRectLabel(opt.target, canvas);
  });

  // Emit updated normalized boxes after drag/resize is finalized.
  canvas.on('object:modified', () => {
    const active = canvas.getActiveObject();
    if (active instanceof Rect) {
      syncRectLabel(active, canvas);
    }

    canvas.requestRenderAll();
    emitBoxesFromCanvas();
  });

  canvas.on('selection:created', emitSelectionStateFromActiveObject);
  canvas.on('selection:updated', emitSelectionStateFromActiveObject);
  canvas.on('selection:cleared', () => emit('update:selectedBoxIndex', -1));
}

function startDrawingRect(canvas: Canvas, event: MouseEvent) {
  const pointer = canvas.getScenePoint(event);
  const startX = clamp(pointer.x, 0, canvas.getWidth());
  const startY = clamp(pointer.y, 0, canvas.getHeight());

  const rect = createRectAtPointer(startX, startY, props.selectedClassId);
  rect.set({ selectable: false, evented: false });

  drawingStart.value = new Point(startX, startY);
  drawingRect.value = rect;
  canvas.add(rect);
}

function updateDrawingRect(canvas: Canvas, event: MouseEvent) {
  if (!drawingRect.value || !drawingStart.value) {
    return;
  }

  const pointer = canvas.getScenePoint(event);
  const clampedX = clamp(pointer.x, 0, canvas.getWidth());
  const clampedY = clamp(pointer.y, 0, canvas.getHeight());

  drawingRect.value.set({
    left: drawingStart.value.x,
    top: drawingStart.value.y,
    width: Math.max(0.001, clampedX - drawingStart.value.x),
    height: Math.max(0.001, clampedY - drawingStart.value.y),
  });

  canvas.requestRenderAll();
}

function finishDrawingRect(canvas: Canvas) {
  if (!drawingRect.value) {
    return;
  }

  const rect = drawingRect.value;
  const width = (rect.width ?? 0) * (rect.scaleX ?? 1);
  const height = (rect.height ?? 0) * (rect.scaleY ?? 1);

  drawingRect.value = null;
  drawingStart.value = null;

  // Ignore accidental clicks that create tiny rectangles.
  if (width < 6 || height < 6) {
    removeRect(rect, canvas);
    canvas.requestRenderAll();
    return;
  }

  rect.set({ selectable: true, evented: true, lockRotation: true });
  rect.setControlsVisibility({ mtr: false });

  canvas.setActiveObject(rect as unknown as FabricObject);
  syncRectLabel(rect, canvas);
  emitSelectionStateFromActiveObject();
  emitBoxesFromCanvas();
  canvas.requestRenderAll();
}

function panViewport(canvas: Canvas, event: MouseEvent) {
  if (!panPoint.value) {
    return;
  }

  const vpt = canvas.viewportTransform;
  if (!vpt) {
    return;
  }

  vpt[4] += event.clientX - panPoint.value.x;
  vpt[5] += event.clientY - panPoint.value.y;
  panPoint.value = { x: event.clientX, y: event.clientY };

  clampViewportTransform(canvas);
  canvas.requestRenderAll();
}

function emitSelectionStateFromActiveObject() {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  const active = canvas.getActiveObject();
  if (!(active instanceof Rect)) {
    emit('update:selectedBoxIndex', -1);
    return;
  }

  emit('update:selectedBoxIndex', getRectIndex(active, canvas));
  emit('update:selectedClassId', getRectClass(active));
}

async function loadImage() {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  if (!props.imageSrc) {
    // Empty-state dimensions when no image is present.
    backgroundImage.value = null;
    canvas.clear();
    canvas.setDimensions({
      width: Math.max(320, viewportRef.value?.clientWidth ?? 960),
      height: Math.max(220, viewportRef.value?.clientHeight ?? 640),
    });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    clampViewportTransform(canvas);
    return;
  }

  try {
    const image = await FabricImage.fromURL(props.imageSrc);

    const sourceWidth = image.width ?? 0;
    const sourceHeight = image.height ?? 0;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error('Loaded image has invalid dimensions.');
    }

    const viewportWidth = viewportRef.value?.clientWidth ?? sourceWidth;
    const width = Math.max(320, Math.round(viewportWidth > 1 ? viewportWidth : sourceWidth));
    const height = Math.max(220, Math.round((sourceHeight / sourceWidth) * width));

    canvas.setDimensions({ width, height });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    clampViewportTransform(canvas);

    image.set({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      scaleX: width / sourceWidth,
      scaleY: height / sourceHeight,
    });

    backgroundImage.value = image;

    canvas.clear();
    canvas.add(image);
    canvas.sendObjectToBack(image as unknown as FabricObject);

    drawBoxesFromProps();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    backgroundImage.value = null;
    canvas.clear();
    emit('image-load-failed', message);
    console.error('Failed to load annotation image.', error);
  }
}

function drawBoxesFromProps() {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  isApplyingProps.value = true;

  removeOverlayObjects(canvas);

  props.boxes.forEach((box) => {
    const rect = createRectFromBox(box, canvas);
    canvas.add(rect);
    syncRectLabel(rect, canvas);
  });

  if (backgroundImage.value) {
    canvas.sendObjectToBack(backgroundImage.value as unknown as FabricObject);
  }

  canvas.requestRenderAll();
  isApplyingProps.value = false;
  syncSelectedRectFromProps();
}

function removeOverlayObjects(canvas: Canvas) {
  canvas
    .getObjects()
    .filter((obj) => obj instanceof Rect || obj instanceof FabricText)
    .forEach((obj) => canvas.remove(obj));
}

function createRectFromBox(box: AnnotationBox, canvas: Canvas): AnyRect {
  const rect = new Rect({
    left: box.x * canvas.getWidth(),
    top: box.y * canvas.getHeight(),
    originX: 'left',
    originY: 'top',
    width: Math.max(1, box.width * canvas.getWidth()),
    height: Math.max(1, box.height * canvas.getHeight()),
    strokeWidth: 2,
    objectCaching: false,
    lockRotation: true,
    transparentCorners: false,
    cornerSize: 10,
    centeredRotation: true,
    centeredScaling: false,
    selectable: true,
    evented: true,
  });

  rect.setControlsVisibility({ mtr: false });
  setRectClass(rect, box.classId);
  styleRect(rect, box.classId);
  return rect;
}

function createRectAtPointer(left: number, top: number, classId: number): AnyRect {
  const rect = new Rect({
    left,
    top,
    originX: 'left',
    originY: 'top',
    width: 0.001,
    height: 0.001,
    strokeWidth: 2,
    objectCaching: false,
    lockRotation: true,
    transparentCorners: false,
    cornerSize: 10,
    centeredRotation: true,
    centeredScaling: false,
  });

  rect.setControlsVisibility({ mtr: false });
  setRectClass(rect, classId);
  styleRect(rect, classId);
  return rect;
}

function constrainRectPositionToImageBounds(rect: AnyRect, canvas: Canvas) {
  const widthPx = Math.max(1, (rect.width ?? 0) * (rect.scaleX ?? 1));
  const heightPx = Math.max(1, (rect.height ?? 0) * (rect.scaleY ?? 1));

  rect.set({
    left: clamp(rect.left ?? 0, 0, Math.max(0, canvas.getWidth() - widthPx)),
    top: clamp(rect.top ?? 0, 0, Math.max(0, canvas.getHeight() - heightPx)),
  });
  rect.setCoords();
}

function constrainScaledRectToImageBounds(rect: AnyRect, canvas: Canvas) {
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();

  let left = rect.left ?? 0;
  let top = rect.top ?? 0;
  let right = left + (rect.width ?? 0) * (rect.scaleX ?? 1);
  let bottom = top + (rect.height ?? 0) * (rect.scaleY ?? 1);

  if (right < left) {
    [left, right] = [right, left];
  }
  if (bottom < top) {
    [top, bottom] = [bottom, top];
  }

  left = clamp(left, 0, canvasWidth);
  top = clamp(top, 0, canvasHeight);
  right = clamp(right, 0, canvasWidth);
  bottom = clamp(bottom, 0, canvasHeight);

  if (right - left < 1) {
    right = Math.min(canvasWidth, left + 1);
  }
  if (bottom - top < 1) {
    bottom = Math.min(canvasHeight, top + 1);
  }

  const baseWidth = Math.max(0.001, rect.width ?? 0.001);
  const baseHeight = Math.max(0.001, rect.height ?? 0.001);

  rect.set({
    left,
    top,
    scaleX: (right - left) / baseWidth,
    scaleY: (bottom - top) / baseHeight,
    flipX: false,
    flipY: false,
  });
  rect.setCoords();
}

function setRectClass(rect: AnyRect, classId: number) {
  rectClassMap.set(rect, classId);
}

function getRectClass(rect: AnyRect) {
  return rectClassMap.get(rect) ?? props.selectedClassId;
}

function styleRect(rect: AnyRect, classId: number) {
  const color = props.classColor(classId);

  rect.set({
    stroke: color,
    fill: 'transparent',
    cornerColor: color,
    cornerStrokeColor: '#ffffff',
  });
}

function syncRectLabel(rect: AnyRect, canvas: Canvas) {
  const classId = getRectClass(rect);
  const color = props.classColor(classId);
  const textValue = props.className(classId);

  let label = rectLabelMap.get(rect);
  if (!label) {
    label = new FabricText(textValue, {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: 'Roboto',
      selectable: false,
      evented: false,
      objectCaching: false,
      originX: 'left',
      originY: 'bottom',
      fill: color,
      stroke: '#000000',
      strokeWidth: 0.35,
    });
    rectLabelMap.set(rect, label);
    canvas.add(label);
  } else {
    label.set({ text: textValue, fill: color });
  }

  label.set({
    left: clamp((rect.left ?? 0) + 2, 0, canvas.getWidth()),
    top: clamp((rect.top ?? 0) - 2, 12, canvas.getHeight()),
  });
}

function emitBoxesFromCanvas() {
  if (isApplyingProps.value) {
    return;
  }

  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  const width = canvas.getWidth();
  const height = canvas.getHeight();

  const boxes = getRectObjects(canvas).map((rect) => {
    const rectWidth = Math.max(0, (rect.width ?? 0) * (rect.scaleX ?? 1));
    const rectHeight = Math.max(0, (rect.height ?? 0) * (rect.scaleY ?? 1));

    return {
      classId: getRectClass(rect),
      x: clamp01((rect.left ?? 0) / width),
      y: clamp01((rect.top ?? 0) / height),
      width: clamp01(rectWidth / width),
      height: clamp01(rectHeight / height),
    };
  });

  emit('update:boxes', boxes);
}

function syncSelectedRectFromProps() {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  const rects = getRectObjects(canvas);
  if (props.selectedBoxIndex < 0 || props.selectedBoxIndex >= rects.length) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    return;
  }

  const rect = rects[props.selectedBoxIndex];
  canvas.setActiveObject(rect as unknown as FabricObject);
  emit('update:selectedClassId', getRectClass(rect));
  canvas.requestRenderAll();
}

function getRectObjects(canvas: Canvas) {
  return canvas.getObjects().filter((obj): obj is AnyRect => obj instanceof Rect);
}

function getRectIndex(rect: AnyRect, canvas: Canvas) {
  return getRectObjects(canvas).indexOf(rect);
}

function removeRect(rect: AnyRect, canvas: Canvas) {
  const label = rectLabelMap.get(rect);
  if (label) {
    canvas.remove(label as unknown as FabricObject);
    rectLabelMap.delete(rect);
  }

  rectClassMap.delete(rect);
  canvas.remove(rect as unknown as FabricObject);
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return;
  }

  // Do not delete when user edits input fields.
  const target = event.target as HTMLElement | null;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable
  ) {
    return;
  }

  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  const active = canvas.getActiveObject();
  if (!(active instanceof Rect)) {
    return;
  }

  event.preventDefault();
  removeRect(active, canvas);
  canvas.discardActiveObject();
  emit('update:selectedBoxIndex', -1);
  emitBoxesFromCanvas();
  canvas.requestRenderAll();
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampViewportTransform(canvas: Canvas) {
  const vpt = canvas.viewportTransform;
  if (!vpt) {
    return;
  }

  const zoom = canvas.getZoom();
  const width = canvas.getWidth();
  const height = canvas.getHeight();

  vpt[4] = clamp(vpt[4], width * (1 - zoom), 0);
  vpt[5] = clamp(vpt[5], height * (1 - zoom), 0);
}
</script>

<style scoped>
.annotation-viewport {
  width: 100%;
  overflow: auto;
  border-radius: 8px;
  background: transparent;
}

.annotation-viewport canvas {
  display: block;
  touch-action: none;
}
</style>

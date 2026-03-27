<template>
  <div ref="viewportRef" class="annotation-viewport" @contextmenu.prevent>
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Canvas, FabricImage, Point, Rect } from 'fabric';
import type { FabricObject, ObjectEvents, RectProps, SerializedRectProps } from 'fabric';

import type { AnnotationBox } from 'src/interfaces/Annotation';

const props = defineProps<{
  imageSrc: string;
  boxes: AnnotationBox[];
  selectedClassId: number;
  classColor: (classId: number) => string;
}>();

const emit = defineEmits<{
  (event: 'update:boxes', value: AnnotationBox[]): void;
  (event: 'update:selectedClassId', value: number): void;
  (event: 'image-load-failed', value: string): void;
}>();

type AnyRect = Rect<Partial<RectProps>, SerializedRectProps, ObjectEvents>;

const viewportRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const fabricCanvas = shallowRef<Canvas | null>(null);
const backgroundImage = shallowRef<FabricImage | null>(null);

const rectClassMap = new WeakMap<AnyRect, number>();

const syncingFromProps = ref(false);
const isPanning = ref(false);
const panPoint = ref<{ x: number; y: number } | null>(null);

const drawingRect = shallowRef<AnyRect | null>(null);
const drawingStart = ref<Point | null>(null);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initCanvas();

  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      void loadImage();
    });
    resizeObserver.observe(viewportRef.value);
  }

  void loadImage();
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (fabricCanvas.value) {
    void fabricCanvas.value.dispose();
    fabricCanvas.value = null;
  }
});

watch(
  () => props.imageSrc,
  () => {
    void loadImage();
  }
);

watch(
  () => props.boxes,
  () => {
    if (syncingFromProps.value) {
      return;
    }

    drawBoxesFromProps();
  },
  { deep: true }
);

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
    canvas.requestRenderAll();
    emitBoxesFromCanvas();
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
  });

  fabricCanvas.value = canvas;

  canvas.on('mouse:wheel', (opt) => {
    const event = opt.e;
    let zoom = canvas.getZoom();
    zoom *= event.deltaY < 0 ? 1.1 : 0.9;
    zoom = Math.max(1, Math.min(8, zoom));

    canvas.zoomToPoint(new Point(event.offsetX, event.offsetY), zoom);
    clampViewportTransform(canvas);
    canvas.requestRenderAll();
    event.preventDefault();
    event.stopPropagation();
  });

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
      emit('update:selectedClassId', getRectClass(opt.target));
      return;
    }

    const pointer = canvas.getScenePoint(event);
    const startX = clamp(pointer.x, 0, canvas.getWidth());
    const startY = clamp(pointer.y, 0, canvas.getHeight());
    const rect = createRectAtPointer(startX, startY, props.selectedClassId);

    rect.set({
      selectable: false,
      evented: false,
    });

    drawingStart.value = new Point(startX, startY);
    drawingRect.value = rect;

    canvas.add(rect);
  });

  canvas.on('mouse:move', (opt) => {
    const event = opt.e as MouseEvent;

    if (isPanning.value && panPoint.value) {
      const vpt = canvas.viewportTransform;
      if (vpt) {
        vpt[4] += event.clientX - panPoint.value.x;
        vpt[5] += event.clientY - panPoint.value.y;
        clampViewportTransform(canvas);
        canvas.requestRenderAll();
      }

      panPoint.value = { x: event.clientX, y: event.clientY };
      return;
    }

    if (!drawingRect.value || !drawingStart.value) {
      return;
    }

    const pointer = canvas.getScenePoint(event);
    const clampedX = clamp(pointer.x, 0, canvas.getWidth());
    const clampedY = clamp(pointer.y, 0, canvas.getHeight());
    const left = drawingStart.value.x;
    const top = drawingStart.value.y;
    const width = Math.max(0.001, clampedX - drawingStart.value.x);
    const height = Math.max(0.001, clampedY - drawingStart.value.y);

    drawingRect.value.set({
      left: clamp(left, 0, canvas.getWidth()),
      top: clamp(top, 0, canvas.getHeight()),
      width,
      height,
    });

    canvas.requestRenderAll();
  });

  canvas.on('mouse:up', () => {
    if (isPanning.value) {
      isPanning.value = false;
      panPoint.value = null;
    }

    if (!drawingRect.value) {
      return;
    }

    const rect = drawingRect.value;
    const width = (rect.width ?? 0) * (rect.scaleX ?? 1);
    const height = (rect.height ?? 0) * (rect.scaleY ?? 1);

    if (width < 6 || height < 6) {
      canvas.remove(rect as unknown as FabricObject);
      drawingRect.value = null;
      drawingStart.value = null;
      canvas.requestRenderAll();
      return;
    }

    rect.set({
      selectable: true,
      evented: true,
      lockRotation: true,
    });
    rect.setControlsVisibility({ mtr: false });

    canvas.setActiveObject(rect as unknown as FabricObject);
    emit('update:selectedClassId', getRectClass(rect));

    drawingRect.value = null;
    drawingStart.value = null;

    emitBoxesFromCanvas();
    canvas.requestRenderAll();
  });

  canvas.on('object:modified', () => {
    constrainActiveRectToImageBounds(canvas);
    canvas.requestRenderAll();
    emitBoxesFromCanvas();
  });

  canvas.on('object:moving', (opt) => {
    if (opt.target instanceof Rect) {
      constrainRectToImageBounds(opt.target, canvas);
    }
  });

  canvas.on('object:scaling', (opt) => {
    if (opt.target instanceof Rect) {
      constrainRectToImageBounds(opt.target, canvas);
    }
  });

  canvas.on('selection:created', () => {
    emitSelectedClassFromActiveObject();
  });

  canvas.on('selection:updated', () => {
    emitSelectedClassFromActiveObject();
  });
}

function emitSelectedClassFromActiveObject() {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  const active = canvas.getActiveObject();
  if (!(active instanceof Rect)) {
    return;
  }

  emit('update:selectedClassId', getRectClass(active));
}

async function loadImage() {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  if (!props.imageSrc) {
    backgroundImage.value = null;
    canvas.clear();
    const viewportWidth = viewportRef.value?.clientWidth ?? 960;
    const viewportHeight = viewportRef.value?.clientHeight ?? 640;
    canvas.setDimensions({
      width: Math.max(320, viewportWidth),
      height: Math.max(220, viewportHeight),
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
    const safeViewportWidth = viewportWidth > 1 ? viewportWidth : sourceWidth;
    const width = Math.max(320, Math.round(safeViewportWidth));
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

  syncingFromProps.value = true;

  canvas
    .getObjects()
    .filter((obj) => obj instanceof Rect)
    .forEach((obj) => {
      canvas.remove(obj);
    });

  props.boxes.forEach((box) => {
    canvas.add(createRect(box));
  });

  if (backgroundImage.value) {
    canvas.sendObjectToBack(backgroundImage.value as unknown as FabricObject);
  }

  canvas.requestRenderAll();
  syncingFromProps.value = false;
}

function createRect(box: AnnotationBox): AnyRect {
  const canvas = fabricCanvas.value;
  if (!canvas) {
    throw new Error('Canvas not ready');
  }

  const widthPx = Math.max(1, box.width * canvas.getWidth());
  const heightPx = Math.max(1, box.height * canvas.getHeight());

  const rect = new Rect({
    left: box.x * canvas.getWidth(),
    top: box.y * canvas.getHeight(),
    originX: 'left',
    originY: 'top',
    width: widthPx,
    height: heightPx,
    strokeWidth: 2,
    objectCaching: false,
    lockRotation: true,
    transparentCorners: false,
    cornerSize: 10,
    centeredRotation: true,
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
  });

  rect.setControlsVisibility({ mtr: false });
  setRectClass(rect, classId);
  styleRect(rect, classId);

  return rect;
}

function constrainActiveRectToImageBounds(canvas: Canvas) {
  const active = canvas.getActiveObject();
  if (!(active instanceof Rect)) {
    return;
  }

  constrainRectToImageBounds(active, canvas);
}

function constrainRectToImageBounds(rect: AnyRect, canvas: Canvas) {
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();

  const widthPx = Math.max(1, (rect.width ?? 0) * (rect.scaleX ?? 1));
  const heightPx = Math.max(1, (rect.height ?? 0) * (rect.scaleY ?? 1));

  const boundedWidth = Math.min(widthPx, canvasWidth);
  const boundedHeight = Math.min(heightPx, canvasHeight);

  const left = clamp(rect.left ?? 0, 0, Math.max(0, canvasWidth - boundedWidth));
  const top = clamp(rect.top ?? 0, 0, Math.max(0, canvasHeight - boundedHeight));

  rect.set({
    left,
    top,
    width: boundedWidth,
    height: boundedHeight,
    scaleX: 1,
    scaleY: 1,
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

function emitBoxesFromCanvas() {
  if (syncingFromProps.value) {
    return;
  }

  const canvas = fabricCanvas.value;
  if (!canvas) {
    return;
  }

  const width = canvas.getWidth();
  const height = canvas.getHeight();

  const boxes = canvas
    .getObjects()
    .filter((obj): obj is AnyRect => obj instanceof Rect)
    .map((rect) => {
      const rectWidth = Math.max(0, (rect.width ?? 0) * (rect.scaleX ?? 1));
      const rectHeight = Math.max(0, (rect.height ?? 0) * (rect.scaleY ?? 1));
      const left = rect.left ?? 0;
      const top = rect.top ?? 0;

      return {
        classId: getRectClass(rect),
        x: clamp01(left / width),
        y: clamp01(top / height),
        width: clamp01(rectWidth / width),
        height: clamp01(rectHeight / height),
      };
    });

  emit('update:boxes', boxes);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
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

  const minTranslateX = width * (1 - zoom);
  const minTranslateY = height * (1 - zoom);

  vpt[4] = clamp(vpt[4], minTranslateX, 0);
  vpt[5] = clamp(vpt[5], minTranslateY, 0);
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

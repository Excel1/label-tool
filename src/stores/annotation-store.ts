import { acceptHMRUpdate, defineStore } from 'pinia';

import classesRaw from '../assets/classes.txt?raw';
import sampleLabelsRaw from '../assets/mock/sample-labels.txt?raw';
import { createAnnotationQueueItem } from 'src/helpers/annotation-queue.helper';
import { parseYoloLabels, serializeYoloLabels } from 'src/helpers/yolo.helper';
import type {
  AnnotationBox,
  AnnotationFrame,
  AnnotationQueueItem
} from 'src/interfaces/Annotation';
import { loadAnnotationClasses } from 'src/services/annotation-classes.service';
import MqttAnnotationService from 'src/services/mqtt-annotation.service';
import MockImageService from 'src/services/mock-image.service';

const DEFAULT_CLASS_COLOR = '#1976d2';
let unsubscribe: (() => void) | null = null;

export const useAnnotationStore = defineStore('annotation', {
  state: () => ({
    queue: [] as AnnotationQueueItem[],
    current: null as AnnotationQueueItem | null,
    classes: loadAnnotationClasses(classesRaw),
    isConnected: false,
    isSubmitting: false,
  }),
  getters: {
    queueLength: (state) => state.queue.length,
    // Quasar q-select options for class picker.
    classOptions: (state) =>
      state.classes.map((item) => ({
        label: item.name,
        value: item.id,
        color: item.color,
      })),
    classColor: (state) => (classId: number) =>
      state.classes.find((item) => item.id === classId)?.color ?? DEFAULT_CLASS_COLOR,
    className: (state) => (classId: number) =>
      state.classes.find((item) => item.id === classId)?.name ?? `class-${classId}`,
  },
  actions: {
    enqueueFrame(payload: AnnotationFrame) {
      // Normalize labels to editable box objects when data enters the queue.
      this.queue.push(createAnnotationQueueItem(payload, parseYoloLabels(payload.labels)));
      if (!this.current) {
        this.current = this.queue[0] ?? null;
      }
    },

    async enqueueMockFrame() {
      // Re-read mock image each time to always use current test file content.
      MockImageService.clearCache();
      const mockImageBase64 = await MockImageService.getBase64Image();
      this.enqueueFrame({
        image: mockImageBase64,
        labels: sampleLabelsRaw.trim(),
      });
    },

    setCurrentBoxes(boxes: AnnotationBox[]) {
      if (!this.current) {
        return;
      }

      const clonedBoxes = boxes.map((box) => ({ ...box }));
      this.current.boxes = clonedBoxes;

      // Keep queue head in sync with the currently edited item.
      if (this.queue.length > 0) {
        this.queue[0].boxes = clonedBoxes.map((box) => ({ ...box }));
      }
    },

    async startListening() {
      try {
        // Already subscribed.
        if (unsubscribe) {
          return;
        }

        await MqttAnnotationService.connect();
        this.isConnected = true;

        unsubscribe = await MqttAnnotationService.subscribe((frame) => {
          this.enqueueFrame(frame);
        });
      } catch (error) {
        console.error(error);
        throw error;
      }
    },

    async stopListening() {
      try {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        await MqttAnnotationService.disconnect();
      } catch (error) {
        console.error(error);
      } finally {
        this.isConnected = false;
        this.isSubmitting = false;
        this.queue = [];
        this.current = null;
      }
    },

    async submitCurrent() {
      try {
        if (!this.current) {
          return;
        }

        this.isSubmitting = true;
        const labelsText = serializeYoloLabels(this.current.boxes);

        console.log('[SEND] image(base64):');
        console.log(this.current.image);
        console.log('[SEND] labels.txt:');
        console.log(labelsText);

        await MqttAnnotationService.publish({
          image: this.current.image,
          labels: labelsText,
        });

        this.queue.shift();
        this.current = this.queue.length > 0 ? this.queue[0] : null;
      } catch (error) {
        console.error(error);
        throw error;
      } finally {
        this.isSubmitting = false;
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAnnotationStore, import.meta.hot));
}

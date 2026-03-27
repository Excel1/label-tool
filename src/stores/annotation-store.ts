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
    classOptions: (state) => state.classes.map((item) => ({ label: `${item.id} - ${item.name}`, value: item.id })),
    classColor: (state) => (classId: number) =>
      state.classes.find((item) => item.id === classId)?.color ?? '#1976d2',
  },
  actions: {
    enqueueFrame(payload: AnnotationFrame) {
      this.queue.push(createAnnotationQueueItem(payload, parseYoloLabels(payload.labels)));
      if (!this.current) {
        this.current = this.queue[0] ?? null;
      }
    },
    async enqueueMockFrame() {
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

      this.current.boxes = boxes.map((box) => ({ ...box }));
      if (this.queue.length > 0) {
        this.queue[0].boxes = this.current.boxes.map((box) => ({ ...box }));
      }
    },
    async startListening() {
      try {
        if (unsubscribe) {
          return;
        }

        await MqttAnnotationService.connect();
        this.isConnected = true;

        unsubscribe = await MqttAnnotationService.subscribe((frame) => {
          this.enqueueFrame(frame);
        });
      } catch (error) {
        console.log(error);
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
        console.log(error);
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

        await MqttAnnotationService.publish({
          image: this.current.image,
          labels: serializeYoloLabels(this.current.boxes),
        });

        this.queue.shift();
        this.current = this.queue.length > 0 ? this.queue[0] : null;
      } catch (error) {
        console.log(error);
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

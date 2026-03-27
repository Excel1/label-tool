import { acceptHMRUpdate, defineStore } from 'pinia';

import sampleImageBase64Raw from '../assets/mock/sample-image-base64.txt?raw';
import sampleLabelsRaw from '../assets/mock/sample-labels.txt?raw';
import type { AnnotationFrame, AnnotationQueueItem } from 'src/interfaces/Annotation';
import MqttAnnotationService from 'src/services/mqtt-annotation.service';

let queueId = 0;
let unsubscribe: (() => void) | null = null;

function createQueueItem(payload: AnnotationFrame): AnnotationQueueItem {
  queueId += 1;

  return {
    id: `msg-${queueId}`,
    image: payload.image,
    labels: payload.labels,
  };
}

export const useAnnotationStore = defineStore('annotation', {
  state: () => ({
    queue: [] as AnnotationQueueItem[],
    current: null as AnnotationQueueItem | null,
    isConnected: false,
    isSubmitting: false,
  }),
  getters: {
    queueLength: (state) => state.queue.length,
  },
  actions: {
    enqueue(payload: AnnotationFrame) {
      this.queue.push(createQueueItem(payload));
      this.current = this.queue.length > 0 ? this.queue[0] : null;
    },
    enqueueMockFrame() {
      this.enqueue({
        image: sampleImageBase64Raw.trim(),
        labels: import.meta.env.VITE_MOCK_INCLUDE_LABELS === 'true' ? sampleLabelsRaw.trim() : '',
      });
    },
    async startListening() {
      try {
        if (unsubscribe) {
          return;
        }

        await MqttAnnotationService.connect();
        this.isConnected = true;

        unsubscribe = await MqttAnnotationService.subscribe((frame) => {
          this.enqueue(frame);
        });
      } catch (error) {
        console.log(error);
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
          labels: this.current.labels,
        });

        this.queue.shift();
        this.current = this.queue.length > 0 ? this.queue[0] : null;
      } catch (error) {
        console.log(error);
      } finally {
        this.isSubmitting = false;
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAnnotationStore, import.meta.hot));
}

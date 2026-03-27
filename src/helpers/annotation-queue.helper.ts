import type { AnnotationBox, AnnotationFrame, AnnotationQueueItem } from 'src/interfaces/Annotation';

let queueId = 0;

export function createAnnotationQueueItem(payload: AnnotationFrame, boxes: AnnotationBox[]): AnnotationQueueItem {
  queueId += 1;

  return {
    id: `msg-${queueId}`,
    image: payload.image,
    boxes,
  };
}

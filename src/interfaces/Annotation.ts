export interface AnnotationFrame {
  image: string;
  labels: string;
}

export interface AnnotationQueueItem extends AnnotationFrame {
  id: string;
}

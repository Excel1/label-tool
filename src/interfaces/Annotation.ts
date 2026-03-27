export interface AnnotationFrame {
  image: string;
  labels: string;
}

export interface AnnotationBox {
  classId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationClass {
  id: number;
  name: string;
  color: string;
}

export interface AnnotationQueueItem {
  id: string;
  image: string;
  boxes: AnnotationBox[];
}

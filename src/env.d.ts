declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_TRANSPORT_MODE: 'mock' | 'mqtt';
  readonly VITE_MQTT_BROKER_URL: string;
  readonly VITE_MQTT_USERNAME?: string;
  readonly VITE_MQTT_PASSWORD?: string;
  readonly VITE_MQTT_CLIENT_ID_PREFIX: string;
  readonly VITE_MQTT_INPUT_TOPIC: string;
  readonly VITE_MQTT_OUTPUT_TOPIC: string;
  readonly VITE_MOCK_INCLUDE_LABELS: 'true' | 'false';
  readonly VITE_YOLO_LABEL_CLASSES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}

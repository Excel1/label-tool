import mqtt from 'mqtt';
import type { IClientOptions, MqttClient } from 'mqtt';
import type { AnnotationFrame } from 'src/interfaces/Annotation';

function requireEnv(value: string | undefined, envName: string) {
  if (!value) {
    throw new Error(`Missing environment variable: ${envName}`);
  }

  return value;
}

const config = {
  brokerUrl: requireEnv(import.meta.env.VITE_MQTT_BROKER_URL, 'VITE_MQTT_BROKER_URL'),
  username: import.meta.env.VITE_MQTT_USERNAME,
  password: import.meta.env.VITE_MQTT_PASSWORD,
  clientIdPrefix: requireEnv(import.meta.env.VITE_MQTT_CLIENT_ID_PREFIX, 'VITE_MQTT_CLIENT_ID_PREFIX'),
  inputTopic: requireEnv(import.meta.env.VITE_MQTT_INPUT_TOPIC, 'VITE_MQTT_INPUT_TOPIC'),
  outputTopic: requireEnv(import.meta.env.VITE_MQTT_OUTPUT_TOPIC, 'VITE_MQTT_OUTPUT_TOPIC'),
};

let client: MqttClient | null = null;
const handlers = new Set<(frame: AnnotationFrame) => void>();
const textDecoder = new TextDecoder();

function parseIncomingFrame(payload: Uint8Array): AnnotationFrame | null {
  const parsed = JSON.parse(textDecoder.decode(payload)) as {
    image?: string;
    labels?: string;
  };

  if (typeof parsed.image !== 'string' || parsed.image.length === 0) {
    return null;
  }

  return {
    image: parsed.image,
    labels: typeof parsed.labels === 'string' ? parsed.labels : '',
  };
}

function registerEvents(activeClient: MqttClient) {
  // Push incoming frames to all active listeners.
  activeClient.on('message', (topic, payload) => {
    if (topic !== config.inputTopic) {
      return;
    }

    try {
      const frame = parseIncomingFrame(payload);
      if (!frame) {
        return;
      }

      handlers.forEach((handler) => handler(frame));
    } catch {
      // Ignore malformed payloads.
    }
  });

  // Clear the shared client reference so reconnect can create a new client.
  activeClient.on('close', () => {
    client = null;
  });
}

async function ensureClient() {
  if (client?.connected) {
    return client;
  }

  const options: IClientOptions = {
    clientId: `${config.clientIdPrefix}-${crypto.randomUUID()}`,
    username: config.username,
    password: config.password,
  };

  const activeClient = await mqtt.connectAsync(config.brokerUrl, options);
  client = activeClient;
  registerEvents(activeClient);
  return activeClient;
}

export default {
  async connect() {
    try {
      await ensureClient();
    } catch (error) {
      throw new Error(`Can't connect MQTT: ${String(error)}`);
    }
  },

  async disconnect() {
    try {
      handlers.clear();

      if (!client) {
        return;
      }

      const activeClient = client;
      client = null;
      await activeClient.endAsync(true);
    } catch (error) {
      throw new Error(`Can't disconnect MQTT: ${String(error)}`);
    }
  },

  async subscribe(handler: (frame: AnnotationFrame) => void) {
    try {
      const activeClient = await ensureClient();
      handlers.add(handler);

      await activeClient.subscribeAsync(config.inputTopic, { qos: 1 });

      return () => {
        handlers.delete(handler);

        if (handlers.size === 0 && client) {
          void client.unsubscribeAsync(config.inputTopic).catch(() => undefined);
        }
      };
    } catch (error) {
      throw new Error(`Can't subscribe MQTT: ${String(error)}`);
    }
  },

  async publish(payload: AnnotationFrame) {
    try {
      const activeClient = await ensureClient();
      const wirePayload = JSON.stringify({
        image: payload.image,
        labels: payload.labels,
      });

      await activeClient.publishAsync(config.outputTopic, wirePayload, { qos: 1 });
    } catch (error) {
      throw new Error(`Can't publish MQTT: ${String(error)}`);
    }
  },
};

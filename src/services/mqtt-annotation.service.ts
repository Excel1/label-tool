import mqtt from 'mqtt';
import type { IClientOptions, MqttClient } from 'mqtt';
import type { AnnotationFrame } from 'src/interfaces/Annotation';

const config = {
  brokerUrl: import.meta.env.VITE_MQTT_BROKER_URL,
  username: import.meta.env.VITE_MQTT_USERNAME,
  password: import.meta.env.VITE_MQTT_PASSWORD,
  clientIdPrefix: import.meta.env.VITE_MQTT_CLIENT_ID_PREFIX,
  inputTopic: import.meta.env.VITE_MQTT_INPUT_TOPIC,
  outputTopic: import.meta.env.VITE_MQTT_OUTPUT_TOPIC,
};

let client: MqttClient | null = null;
const handlers = new Set<(frame: AnnotationFrame) => void>();

function requireClient() {
  if (!client) {
    throw new Error('MQTT client is not connected.');
  }

  return client;
}

function registerEvents(activeClient: MqttClient) {
  activeClient.on('message', (topic, payload) => {
    if (topic !== config.inputTopic) {
      return;
    }

    try {
      const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
        image?: string;
        labels?: string;
      };

      if (typeof parsed.image !== 'string' || parsed.image.length === 0) {
        return;
      }

      const frame = {
        image: parsed.image,
        labels: typeof parsed.labels === 'string' ? parsed.labels : '',
      };

      handlers.forEach((handler) => {
        handler(frame);
      });
    } catch {
      // Ignore malformed payloads.
    }
  });

  activeClient.on('close', () => {
    client = null;
  });
}

export default {
  async connect() {
    try {
      if (client?.connected) {
        return;
      }

      const options: IClientOptions = {
        clientId: `${config.clientIdPrefix}-${crypto.randomUUID()}`,
        username: config.username,
        password: config.password,
      };

      const activeClient = mqtt.connect(config.brokerUrl, options);
      client = activeClient;

      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          registerEvents(activeClient);
          resolve();
        };

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        const cleanup = () => {
          activeClient.off('connect', onConnect);
          activeClient.off('error', onError);
        };

        activeClient.once('connect', onConnect);
        activeClient.once('error', onError);
      });
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

      await new Promise<void>((resolve) => {
        activeClient.end(true, {}, () => resolve());
      });
    } catch (error) {
      throw new Error(`Can't disconnect MQTT: ${String(error)}`);
    }
  },

  async subscribe(handler: (frame: AnnotationFrame) => void) {
    try {
      await this.connect();

      const activeClient = requireClient();
      handlers.add(handler);

      await new Promise<void>((resolve, reject) => {
        activeClient.subscribe(config.inputTopic, { qos: 1 }, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      return () => {
        handlers.delete(handler);

        if (handlers.size === 0 && client) {
          client.unsubscribe(config.inputTopic, () => undefined);
        }
      };
    } catch (error) {
      throw new Error(`Can't subscribe MQTT: ${String(error)}`);
    }
  },

  async publish(payload: AnnotationFrame) {
    try {
      await this.connect();

      const activeClient = requireClient();
      const wirePayload = JSON.stringify({
        image: payload.image,
        labels: payload.labels,
      });

      await new Promise<void>((resolve, reject) => {
        activeClient.publish(config.outputTopic, wirePayload, { qos: 1 }, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch (error) {
      throw new Error(`Can't publish MQTT: ${String(error)}`);
    }
  },
};

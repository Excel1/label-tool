import { defineStore } from '#q-app/wrappers';
import { createPinia } from 'pinia';

declare module 'pinia' {
  // Extend this interface when introducing global Pinia helpers.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface PiniaCustomProperties {
    // Intentionally empty for now.
  }
}

export default defineStore(() => {
  // Central Pinia entry point for the app.
  return createPinia();
});

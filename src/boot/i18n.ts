import { defineBoot } from '#q-app/wrappers';
import { createI18n } from 'vue-i18n';

import messages from 'src/i18n';

export type MessageLanguages = keyof typeof messages;
// Use en-US as the schema source for typed translations.
export type MessageSchema = typeof messages['en-US'];

/* eslint-disable @typescript-eslint/no-empty-object-type */
declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends MessageSchema {}
  export interface DefineDateTimeFormat {}
  export interface DefineNumberFormat {}
}
/* eslint-enable @typescript-eslint/no-empty-object-type */

export default defineBoot(({ app }) => {
  // Create a single app-wide i18n instance with typed message keys.
  const i18n = createI18n<{ message: MessageSchema }, MessageLanguages>({
    locale: 'en-US',
    legacy: false,
    messages,
  });

  // Register i18n plugin in Vue app.
  app.use(i18n);
});

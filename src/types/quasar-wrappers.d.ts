declare module '#q-app/wrappers' {
  export function defineBoot<T>(
    callback: (params: { app: { use(plugin: unknown): unknown } }) => T
  ): (params: { app: { use(plugin: unknown): unknown } }) => T;
  export function defineRouter<T>(callback: (params: Record<string, never>) => T): (params: Record<string, never>) => T;
  export function defineStore<T>(callback: (params: Record<string, never>) => T): (params: Record<string, never>) => T;
  export function defineConfig<T>(callback: (ctx: { modeName: string }) => T): (ctx: { modeName: string }) => T;
}

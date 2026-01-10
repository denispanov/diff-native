import type { Change, DiffLinesOptions, DiffOptions } from 'diff-native';
import type * as DiffNative from 'diff-native';
import { loadWasmModule } from './utils/wasm-loader';

export type { Change, DiffOptions, DiffLinesOptions };

let wasmModule: typeof DiffNative | null = null;

export async function getWasmModule(): Promise<typeof DiffNative> {
  if (!wasmModule) {
    try {
      wasmModule = await loadWasmModule<typeof DiffNative>();

      if (typeof wasmModule.set_panic_hook === 'function') {
        wasmModule.set_panic_hook();
      }
    } catch (error) {
      console.error('Failed to initialize WASM module:', error);
      throw error;
    }
  }

  return wasmModule;
}

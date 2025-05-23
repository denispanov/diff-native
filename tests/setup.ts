import { loadWasmModule } from './utils/wasm-loader';
import type { Change, DiffOptions, DiffLinesOptions } from 'diff-native';
import * as DiffNative from 'diff-native';

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

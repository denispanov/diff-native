export async function loadWasmModule<T>(): Promise<T> {
  try {
    const projectRoot = process.cwd();
    const moduleUrl = `file://${projectRoot}/dist/node/index.js`;
    const module = await import(moduleUrl);

    return module as unknown as T;
  } catch (error) {
    console.error('Failed to load WebAssembly module:', error);
    throw error;
  }
}

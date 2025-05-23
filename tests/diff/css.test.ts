import { describe, it, expect, beforeAll } from 'bun:test';
import { getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('diffCss (WASM)', () => {
  it('should diff css', () => {
    const diff = wasm.diffCss(
      '.test,#value .test{margin-left:50px;margin-right:-40px}',
      '.test2, #value2 .test {\nmargin-top:50px;\nmargin-right:-400px;\n}',
      {}
    );

    const xml = wasm.convertChangesToXML(diff);

    const expected =
      '<del>.test</del><ins>.test2</ins>,' +
      '<del>#value</del> <ins>#value2 </ins>.test<ins> </ins>{' +
      '<del>margin-left</del><ins>\nmargin-top</ins>:50px;<ins>\n</ins>' +
      'margin-right:<del>-40px</del><ins>-400px;\n</ins>}';

    expect(xml).toBe(expected);
  });
});

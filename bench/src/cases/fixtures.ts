import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchCase, CaseMeta, DiffInput, PatchInput } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures');

export function buildFixtureCases(): BenchCase[] {
  const cases: BenchCase[] = [];

  const lockOld = readText('lockfile-old.txt');
  const lockNew = readText('lockfile-new.txt');
  const sourceOld = readText('source-old.ts');
  const sourceNew = readText('source-new.ts');
  const pkgOldStr = readText('package-lock-old.json');
  const pkgNewStr = readText('package-lock-new.json');

  const pkgOld = JSON.parse(pkgOldStr);
  const pkgNew = JSON.parse(pkgNewStr);

  cases.push(
    buildDiffFixtureCase({
      id: 'fixture-lockfile-lines',
      level: 'line',
      oldValue: lockOld,
      newValue: lockNew,
      meta: buildLineMeta(lockOld, lockNew, 'lockfile'),
    })
  );

  cases.push(
    buildPatchFixtureCase({
      id: 'fixture-lockfile-patch',
      oldFileName: 'bun.lock',
      newFileName: 'bun.lock',
      oldStr: lockOld,
      newStr: lockNew,
      meta: buildLineMeta(lockOld, lockNew, 'lockfile'),
    })
  );

  cases.push(
    buildDiffFixtureCase({
      id: 'fixture-source-lines',
      level: 'line',
      oldValue: sourceOld,
      newValue: sourceNew,
      meta: buildLineMeta(sourceOld, sourceNew, 'source'),
    })
  );

  cases.push(
    buildDiffFixtureCase({
      id: 'fixture-source-words',
      level: 'word',
      oldValue: sourceOld,
      newValue: sourceNew,
      meta: buildWordMeta(sourceOld, sourceNew, 'source'),
    })
  );

  cases.push(
    buildPatchFixtureCase({
      id: 'fixture-source-patch',
      oldFileName: 'src/utils/receipt.ts',
      newFileName: 'src/utils/receipt.ts',
      oldStr: sourceOld,
      newStr: sourceNew,
      meta: buildLineMeta(sourceOld, sourceNew, 'source'),
    })
  );

  cases.push(
    buildDiffFixtureCase({
      id: 'fixture-package-lock-json',
      level: 'json',
      oldValue: pkgOld,
      newValue: pkgNew,
      meta: buildJsonMeta(pkgOldStr, pkgNewStr, 'package-lock'),
    })
  );

  cases.push(
    buildPatchFixtureCase({
      id: 'fixture-package-lock-patch',
      oldFileName: 'package-lock.json',
      newFileName: 'package-lock.json',
      oldStr: pkgOldStr,
      newStr: pkgNewStr,
      meta: buildLineMeta(pkgOldStr, pkgNewStr, 'package-lock'),
    })
  );

  return cases;
}

function buildDiffFixtureCase(params: {
  id: string;
  level: CaseMeta['level'];
  oldValue: unknown;
  newValue: unknown;
  meta: CaseMeta;
}): BenchCase {
  const meta: CaseMeta = {
    ...params.meta,
    kind: 'diff',
    level: params.level,
    fixture: params.meta.fixture,
  };

  const input: DiffInput = {
    oldValue: params.oldValue,
    newValue: params.newValue,
  };

  return {
    id: params.id,
    kind: 'diff',
    level: params.level,
    meta,
    buildInput: () => input,
  };
}

function buildPatchFixtureCase(params: {
  id: string;
  oldFileName: string;
  newFileName: string;
  oldStr: string;
  newStr: string;
  meta: CaseMeta;
}): BenchCase {
  const meta: CaseMeta = {
    ...params.meta,
    kind: 'patch',
    fixture: params.meta.fixture,
  };

  const input: PatchInput = {
    oldFileName: params.oldFileName,
    newFileName: params.newFileName,
    oldStr: params.oldStr,
    newStr: params.newStr,
    oldHeader: '',
    newHeader: '',
  };

  return {
    id: params.id,
    kind: 'patch',
    level: meta.level,
    meta,
    buildInput: () => input,
  };
}

function buildLineMeta(oldStr: string, newStr: string, fixture: string): CaseMeta {
  const oldLines = countLines(oldStr);
  const newLines = countLines(newStr);
  return {
    kind: 'diff',
    fixture,
    level: 'line',
    oldLength: oldLines,
    newLength: newLines,
    diffCount: Math.abs(newLines - oldLines),
  };
}

function buildWordMeta(oldStr: string, newStr: string, fixture: string): CaseMeta {
  const oldWords = countWords(oldStr);
  const newWords = countWords(newStr);
  return {
    kind: 'diff',
    fixture,
    level: 'word',
    oldLength: oldWords,
    newLength: newWords,
    diffCount: Math.abs(newWords - oldWords),
  };
}

function buildJsonMeta(oldStr: string, newStr: string, fixture: string): CaseMeta {
  return {
    kind: 'diff',
    fixture,
    level: 'json',
    oldLength: countLines(oldStr),
    newLength: countLines(newStr),
    diffCount: Math.abs(countLines(newStr) - countLines(oldStr)),
  };
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function readText(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

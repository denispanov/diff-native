import { defaultRng } from './rng.js';

export interface JsonTestCase {
  oldJson: string;
  newJson: string;
}

export interface JsonParams {
  oldLength: number;
  newLength: number;
  diffCount: number;
  diffMode?: 'onlyInsertions' | 'onlyDeletions' | 'mixed';
  rng?: () => number;
}

let initialKeyCount = 0;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function randomJsonValue(rng: () => number, depth = 0, maxDepth = 2): JsonValue {
  const typeRoll = rng();
  let type: number;

  if (depth >= maxDepth) {
    type = Math.floor(rng() * 4);
  } else if (depth === 0 && initialKeyCount > 1) {
    type = 4 + Math.floor(rng() * 2);
  } else {
    if (typeRoll < 0.6) {
      type = Math.floor(rng() * 4);
    } else if (typeRoll < 0.85) {
      type = 4;
    } else {
      type = 5;
    }
  }

  switch (type) {
    case 0:
      return `str_${String(Math.floor(rng() * 1000))}`;
    case 1:
      return Math.floor(rng() * 10000) - 5000;
    case 2:
      return rng() < 0.5;
    case 3:
      return null;
    case 4: {
      const arrLength = Math.floor(rng() * 3) + 1;
      return Array.from({ length: arrLength }, () => randomJsonValue(rng, depth + 1, maxDepth));
    }
    case 5: {
      const objLength = Math.floor(rng() * 2) + 1;
      const obj: Record<string, JsonValue> = {};
      for (let i = 0; i < objLength; i++) {
        const keyPartDynamic = String(Math.floor(rng() * 100));
        obj[`nestedKey_${String(depth)}_${String(i)}_${keyPartDynamic}`] = randomJsonValue(
          rng,
          depth + 1,
          maxDepth
        );
      }
      return obj;
    }
    default:
      return `fallback_${String(Math.floor(rng() * 1000))}`;
  }
}

export function generateExampleJsonObjects(params: JsonParams): JsonTestCase {
  const rng = params.rng ?? defaultRng();
  initialKeyCount = params.oldLength;
  let numOps = params.diffCount;
  const mode = params.diffMode ?? 'mixed';

  const oldObj: Record<string, JsonValue> = {};
  for (let i = 0; i < initialKeyCount; i++) {
    oldObj[`rootKey${String(i)}`] = randomJsonValue(rng, 0);
  }

  const newObj = JSON.parse(JSON.stringify(oldObj)) as Record<string, JsonValue>;
  let currentTotalProperties = countTotalProperties(newObj);

  if (mode === 'onlyDeletions' && numOps > currentTotalProperties && currentTotalProperties > 0) {
    numOps = currentTotalProperties;
  } else if (mode === 'onlyDeletions' && currentTotalProperties === 0) {
    numOps = 0;
  }

  for (let opIdx = 0; opIdx < numOps; opIdx++) {
    let operationTypeChoice: 'add' | 'delete' | 'modify';
    const allKeysPaths = getAllKeysPaths(newObj);

    if (mode === 'onlyInsertions') {
      operationTypeChoice = 'add';
    } else if (mode === 'onlyDeletions') {
      if (currentTotalProperties === 0) {
        if (numOps === 1 && opIdx === 0) numOps = 0;
        continue;
      }
      operationTypeChoice = 'delete';
    } else {
      const roll = rng();
      if (roll < 0.33 && allKeysPaths.length > 0) operationTypeChoice = 'delete';
      else if (roll < 0.66 && allKeysPaths.length > 0) operationTypeChoice = 'modify';
      else operationTypeChoice = 'add';
    }

    switch (operationTypeChoice) {
      case 'add': {
        let parentPathForAdd = selectRandomPath(allKeysPaths, rng, true);
        let parentNodeForAdd = getNestedProperty(newObj, parentPathForAdd);

        if (typeof parentNodeForAdd !== 'object' || parentNodeForAdd === null) {
          parentPathForAdd = parentPathForAdd.length > 0 ? parentPathForAdd.slice(0, -1) : [];
          parentNodeForAdd = getNestedProperty(newObj, parentPathForAdd) ?? newObj;
        }
        if (Array.isArray(parentNodeForAdd)) {
          parentNodeForAdd.push(randomJsonValue(rng, parentPathForAdd.length));
        } else if (typeof parentNodeForAdd === 'object' && parentNodeForAdd !== null) {
          const addedKeyPart = String(Math.floor(rng() * 1000));
          parentNodeForAdd[`addedKey_${String(opIdx)}_${addedKeyPart}`] = randomJsonValue(
            rng,
            parentPathForAdd.length
          );
        } else {
          const addedRootKeyPart = String(Math.floor(rng() * 1000));
          newObj[`addedRootKey_${String(opIdx)}_${addedRootKeyPart}`] = randomJsonValue(rng, 0);
        }
        break;
      }
      case 'delete':
        if (allKeysPaths.length > 0) {
          const pathToDelete = selectRandomPath(allKeysPaths, rng, false);
          if (pathToDelete.length > 0) {
            const parentPathToDelete = pathToDelete.slice(0, -1);
            const keyOrIndexToDelete = pathToDelete[pathToDelete.length - 1];
            const parentOfDeletionTarget = getNestedProperty(newObj, parentPathToDelete) ?? newObj;

            if (Array.isArray(parentOfDeletionTarget) && typeof keyOrIndexToDelete === 'number') {
              parentOfDeletionTarget.splice(keyOrIndexToDelete, 1);
            } else if (
              typeof parentOfDeletionTarget === 'object' &&
              parentOfDeletionTarget !== null &&
              typeof keyOrIndexToDelete === 'string'
            ) {
              delete parentOfDeletionTarget[keyOrIndexToDelete];
            }
          }
        }
        break;
      case 'modify':
        if (allKeysPaths.length > 0) {
          const pathToModify = selectRandomPath(allKeysPaths, rng, false);
          if (pathToModify.length > 0) {
            const parentPathToModify = pathToModify.slice(0, -1);
            const keyOrIndexToModify = pathToModify[pathToModify.length - 1];
            const parentOfModificationTarget =
              getNestedProperty(newObj, parentPathToModify) ?? newObj;
            const newValue = randomJsonValue(rng, pathToModify.length);
            if (
              Array.isArray(parentOfModificationTarget) &&
              typeof keyOrIndexToModify === 'number'
            ) {
              parentOfModificationTarget[keyOrIndexToModify] = newValue;
            } else if (
              typeof parentOfModificationTarget === 'object' &&
              parentOfModificationTarget !== null &&
              typeof keyOrIndexToModify === 'string'
            ) {
              parentOfModificationTarget[keyOrIndexToModify] = newValue;
            }
          }
        }
        break;
    }
    currentTotalProperties = countTotalProperties(newObj);
  }
  return {
    oldJson: JSON.stringify(oldObj, null, 2),
    newJson: JSON.stringify(newObj, null, 2),
  };
}

function getAllKeysPaths(
  obj: unknown,
  currentPath: (string | number)[] = []
): (string | number)[][] {
  let paths: (string | number)[][] = [];
  if (typeof obj === 'object' && obj !== null) {
    const record = obj as Record<string, unknown>;
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        const newPathSegment = Array.isArray(obj) ? Number.parseInt(key) : key;
        const newPath = [...currentPath, newPathSegment];
        paths.push(newPath);
        paths = paths.concat(getAllKeysPaths(record[key], newPath));
      }
    }
  }
  return paths.filter(p => p.length > 0);
}

function getNestedProperty(obj: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    const record = current as Record<string, unknown>;
    return key in record ? record[key as string] : undefined;
  }, obj);
}

function selectRandomPath(
  paths: (string | number)[][],
  rng: () => number,
  allowEmptyForRoot: boolean
): (string | number)[] {
  if (paths.length === 0 && allowEmptyForRoot) return [];
  if (paths.length === 0 && !allowEmptyForRoot)
    return [`fallbackKey_empty_path_${String(Math.floor(rng() * 100))}`];
  const randomIndex = Math.floor(rng() * paths.length);
  return paths[randomIndex];
}

function countTotalProperties(obj: unknown): number {
  let count = 0;
  if (typeof obj === 'object' && obj !== null) {
    const record = obj as Record<string, unknown>;
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        count++;
        count += countTotalProperties(record[key]);
      }
    }
  }
  return count;
}

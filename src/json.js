export function canonicalize(obj, stack, replacementStack, replacer, key) {
  stack = stack || [];
  replacementStack = replacementStack || [];
  if (replacer) {
    obj = replacer(key === undefined ? '' : key, obj);
  }

  let i;
  for (i = 0; i < stack.length; i += 1) {
    if (stack[i] === obj) {
      return replacementStack[i];
    }
  }

  let canonicalizedObj;
  if ('[object Array]' === Object.prototype.toString.call(obj)) {
    stack.push(obj);
    canonicalizedObj = new Array(obj.length);
    replacementStack.push(canonicalizedObj);
    for (i = 0; i < obj.length; i += 1) {
      canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, String(i));
    }
    stack.pop();
    replacementStack.pop();
    return canonicalizedObj;
  }

  // biome-ignore lint/complexity/useOptionalChain: Preserve jsdiff's property access order.
  if (obj && obj.toJSON) {
    obj = obj.toJSON();
  }

  if (typeof obj === 'object' && obj !== null) {
    stack.push(obj);
    canonicalizedObj = {};
    replacementStack.push(canonicalizedObj);
    const sortedKeys = [];
    let objectKey;
    for (objectKey in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, objectKey)) {
        sortedKeys.push(objectKey);
      }
    }
    sortedKeys.sort();
    for (i = 0; i < sortedKeys.length; i += 1) {
      objectKey = sortedKeys[i];
      canonicalizedObj[objectKey] = canonicalize(
        obj[objectKey],
        stack,
        replacementStack,
        replacer,
        objectKey
      );
    }
    stack.pop();
    replacementStack.pop();
  } else {
    canonicalizedObj = obj;
  }

  return canonicalizedObj;
}

function castInput(value, options) {
  const {
    undefinedReplacement,
    stringifyReplacer = (_key, item) => (typeof item === 'undefined' ? undefinedReplacement : item),
  } = options;
  return typeof value === 'string'
    ? value
    : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), null, '  ');
}

function validateInput(value) {
  if (typeof value !== 'string') value.split(/(\n|\r\n)/);
}

const nativeIsWellFormed = String.prototype.isWellFormed;

function isWellFormed(value) {
  if (nativeIsWellFormed) return nativeIsWellFormed.call(value);
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function encodeUtf16(value) {
  let encoded = '';
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    encoded += unit < 0xd800 ? value[i] : String.fromCodePoint(unit + 0x800);
  }
  return encoded;
}

function decodeUtf16(value) {
  let decoded = '';
  for (const character of value) {
    const point = character.codePointAt(0);
    decoded += point < 0xe000 ? character : String.fromCharCode(point - 0x800);
  }
  return decoded;
}

export function diffJson(nativeDiffJson, oldValue, newValue, options) {
  if (options === undefined) {
    options = {};
  } else if (typeof options !== 'function') {
    void ('callback' in options);
  }

  const oldString = castInput(oldValue, options);
  const newString = castInput(newValue, options);

  validateInput(oldString);
  validateInput(newString);

  const encodedUtf16 =
    (typeof oldValue === 'string' && !isWellFormed(oldString)) ||
    (typeof newValue === 'string' && !isWellFormed(newString));

  return nativeDiffJson(
    encodedUtf16 ? encodeUtf16(oldString) : oldString,
    encodedUtf16 ? encodeUtf16(newString) : newString,
    {
      encodedUtf16,
      ignoreCase: !!options.ignoreCase,
      oneChangePerToken: !!options.oneChangePerToken,
    }
  ).map(({ count, added, removed, value }) => ({
    count,
    added,
    removed,
    value: encodedUtf16 ? decodeUtf16(value) : value,
  }));
}

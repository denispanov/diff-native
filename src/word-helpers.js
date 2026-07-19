function segment(value, segmenter) {
  const parts = [];
  for (const item of Array.from(segmenter.segment(value))) {
    const part = item.segment;
    if (parts.length && /\s/.test(parts[parts.length - 1]) && /\s/.test(part)) {
      parts[parts.length - 1] += part;
    } else {
      parts.push(part);
    }
  }
  return parts;
}

function tokenizeParts(parts) {
  const tokens = [];
  let previous = null;
  for (const part of parts) {
    if (/\s/.test(part)) {
      if (previous == null) {
        tokens.push(part);
      } else {
        tokens.push(tokens.pop() + part);
      }
    } else if (previous != null && /\s/.test(previous)) {
      // biome-ignore lint/suspicious/noDoubleEquals: jsdiff coerces duck-typed segment values here.
      if (tokens[tokens.length - 1] == previous) {
        tokens.push(tokens.pop() + part);
      } else {
        tokens.push(previous + part);
      }
    } else {
      tokens.push(part);
    }
    previous = part;
  }
  return tokens;
}

export function tokenizeWithSegmenter(value, options) {
  if (!options.intlSegmenter) {
    return null;
  }
  const segmenter = options.intlSegmenter;
  // biome-ignore lint/suspicious/noDoubleEquals: jsdiff accepts values loosely equal to "word".
  if (segmenter.resolvedOptions().granularity != 'word') {
    throw new Error('The segmenter passed must have a granularity of "word"');
  }
  return tokenizeParts(segment(value, segmenter));
}

export function tokenizePairWithSegmenter(oldValue, newValue, options) {
  const oldTokens = tokenizeWithSegmenter(oldValue, options);
  const newTokens = tokenizeWithSegmenter(newValue, options);
  return oldTokens === null && newTokens === null ? null : [oldTokens, newTokens];
}

export function wordEquals(left, right, ignoreCase) {
  if (ignoreCase) {
    left = left.toLowerCase();
    right = right.toLowerCase();
  }
  return left.trim() === right.trim();
}

export function wordJoin(tokens) {
  return tokens.map((token, index) => (index === 0 ? token : token.replace(/^\s+/, ''))).join('');
}

function longestCommonPrefix(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index++;
  }
  return left.slice(0, index);
}

function longestCommonSuffix(left, right) {
  if (!left || !right || left[left.length - 1] !== right[right.length - 1]) {
    return '';
  }
  let index = 0;
  while (
    index < left.length &&
    index < right.length &&
    left[left.length - index - 1] === right[right.length - index - 1]
  ) {
    index++;
  }
  return left.slice(-index);
}

function replacePrefix(value, oldPrefix, newPrefix) {
  if (value.slice(0, oldPrefix.length) !== oldPrefix) {
    throw Error(
      `string ${JSON.stringify(value)} doesn't start with prefix ${JSON.stringify(oldPrefix)}; this is a bug`
    );
  }
  return newPrefix + value.slice(oldPrefix.length);
}

function replaceSuffix(value, oldSuffix, newSuffix) {
  if (!oldSuffix) {
    return value + newSuffix;
  }
  if (value.slice(-oldSuffix.length) !== oldSuffix) {
    throw Error(
      `string ${JSON.stringify(value)} doesn't end with suffix ${JSON.stringify(oldSuffix)}; this is a bug`
    );
  }
  return value.slice(0, -oldSuffix.length) + newSuffix;
}

function maximumOverlap(left, right) {
  let startLeft = 0;
  if (left.length > right.length) {
    startLeft = left.length - right.length;
  }
  let endRight = right.length;
  if (left.length < right.length) {
    endRight = left.length;
  }

  const fallback = Array(endRight);
  let prefixLength = 0;
  fallback[0] = 0;
  for (let index = 1; index < endRight; index++) {
    if (right[index] === right[prefixLength]) {
      fallback[index] = fallback[prefixLength];
    } else {
      fallback[index] = prefixLength;
    }
    while (prefixLength > 0 && right[index] !== right[prefixLength]) {
      prefixLength = fallback[prefixLength];
    }
    if (right[index] === right[prefixLength]) {
      prefixLength++;
    }
  }

  prefixLength = 0;
  for (let index = startLeft; index < left.length; index++) {
    while (prefixLength > 0 && left[index] !== right[prefixLength]) {
      prefixLength = fallback[prefixLength];
    }
    if (left[index] === right[prefixLength]) {
      prefixLength++;
    }
  }
  return right.slice(0, prefixLength);
}

function leadingAndTrailingWhitespace(value, segmenter) {
  // biome-ignore lint/suspicious/noDoubleEquals: jsdiff accepts values loosely equal to "word".
  if (segmenter.resolvedOptions().granularity != 'word') {
    throw new Error('The segmenter passed must have a granularity of "word"');
  }
  const parts = segment(value, segmenter);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return [/\s/.test(first) ? first : '', /\s/.test(last) ? last : ''];
}

function leadingWhitespace(value, segmenter) {
  return leadingAndTrailingWhitespace(value, segmenter)[0];
}

function trailingWhitespace(value, segmenter) {
  return leadingAndTrailingWhitespace(value, segmenter)[1];
}

export function dedupeWordWhitespace(values, segmenter) {
  const [startKeep, deletion, insertion, endKeep] = values.map(value =>
    value == null ? null : { value }
  );

  if (deletion && insertion) {
    const [oldPrefix, oldSuffix] = leadingAndTrailingWhitespace(deletion.value, segmenter);
    const [newPrefix, newSuffix] = leadingAndTrailingWhitespace(insertion.value, segmenter);
    if (startKeep) {
      const commonPrefix = longestCommonPrefix(oldPrefix, newPrefix);
      startKeep.value = replaceSuffix(startKeep.value, newPrefix, commonPrefix);
      deletion.value = replacePrefix(deletion.value, commonPrefix, '');
      insertion.value = replacePrefix(insertion.value, commonPrefix, '');
    }
    if (endKeep) {
      const commonSuffix = longestCommonSuffix(oldSuffix, newSuffix);
      endKeep.value = replacePrefix(endKeep.value, newSuffix, commonSuffix);
      deletion.value = replaceSuffix(deletion.value, commonSuffix, '');
      insertion.value = replaceSuffix(insertion.value, commonSuffix, '');
    }
  } else if (insertion) {
    if (startKeep) {
      const whitespace = leadingWhitespace(insertion.value, segmenter);
      insertion.value = insertion.value.substring(whitespace.length);
    }
    if (endKeep) {
      const whitespace = leadingWhitespace(endKeep.value, segmenter);
      endKeep.value = endKeep.value.substring(whitespace.length);
    }
  } else if (startKeep && endKeep) {
    const fullWhitespace = leadingWhitespace(endKeep.value, segmenter);
    const [deletionStart, deletionEnd] = leadingAndTrailingWhitespace(deletion.value, segmenter);
    const newStart = longestCommonPrefix(fullWhitespace, deletionStart);
    deletion.value = replacePrefix(deletion.value, newStart, '');
    const newEnd = longestCommonSuffix(replacePrefix(fullWhitespace, newStart, ''), deletionEnd);
    deletion.value = replaceSuffix(deletion.value, newEnd, '');
    endKeep.value = replacePrefix(endKeep.value, fullWhitespace, newEnd);
    startKeep.value = replaceSuffix(
      startKeep.value,
      fullWhitespace,
      fullWhitespace.slice(0, fullWhitespace.length - newEnd.length)
    );
  } else if (endKeep) {
    const endPrefix = leadingWhitespace(endKeep.value, segmenter);
    const deletionSuffix = trailingWhitespace(deletion.value, segmenter);
    deletion.value = replaceSuffix(deletion.value, maximumOverlap(deletionSuffix, endPrefix), '');
  } else if (startKeep) {
    const startSuffix = trailingWhitespace(startKeep.value, segmenter);
    const deletionPrefix = leadingWhitespace(deletion.value, segmenter);
    deletion.value = replacePrefix(deletion.value, maximumOverlap(startSuffix, deletionPrefix), '');
  }

  return [startKeep?.value, deletion?.value, insertion?.value, endKeep?.value];
}

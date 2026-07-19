const INCLUDE_HEADERS = {
  includeIndex: true,
  includeUnderline: true,
  includeFileHeaders: true,
};

export function formatPatchBoundary(patch, headerOptions) {
  headerOptions = headerOptions || INCLUDE_HEADERS;
  if (Array.isArray(patch)) {
    if (
      patch.length > 1 &&
      !headerOptions.includeFileHeaders &&
      !patch.every(value => value.isGit)
    ) {
      throw new Error(
        'Cannot omit file headers on a multi-file patch. ' +
          '(The result would be unparseable; how would a tool trying to apply ' +
          'the patch know which changes are to which file?)'
      );
    }
    return patch.map(value => formatPatchBoundary(value, headerOptions)).join('\n');
  }

  const output = [];
  if (patch.isGit) {
    headerOptions = INCLUDE_HEADERS;
  } else {
    if (
      headerOptions.includeIndex &&
      // biome-ignore lint/suspicious/noDoubleEquals: Match diff@9 filename coercion.
      patch.oldFileName == patch.newFileName &&
      patch.oldFileName !== undefined
    ) {
      output.push('Index: ' + patch.oldFileName);
    }
    if (headerOptions.includeUnderline)
      output.push('===================================================================');
  }

  const hasHunks = patch.hunks.length > 0;
  if (
    headerOptions.includeFileHeaders &&
    patch.oldFileName !== undefined &&
    patch.newFileName !== undefined &&
    (!patch.isGit || hasHunks)
  ) {
    output.push('--- ' + patch.oldFileName + (patch.oldHeader ? '\t' + patch.oldHeader : ''));
    output.push('+++ ' + patch.newFileName + (patch.newHeader ? '\t' + patch.newHeader : ''));
  }
  for (let index = 0; index < patch.hunks.length; index++) {
    const hunk = patch.hunks[index];
    const oldStart = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart;
    const newStart = hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart;
    output.push(
      '@@ -' + oldStart + ',' + hunk.oldLines + ' +' + newStart + ',' + hunk.newLines + ' @@'
    );
    for (const line of hunk.lines) output.push(line);
  }
  return output.join('\n') + '\n';
}

export function hunksLengthBoundary(hunks) {
  return hunks.length;
}

export function patchHunksBoundary(patch) {
  return patch.hunks;
}

export function preparePatchBoundary(source, patch, options) {
  if (options === undefined) options = {};
  if (options.autoConvertLineEndings || options.autoConvertLineEndings == null) {
    if (source.includes('\r\n') && !source.startsWith('\n') && !source.match(/[^\r]\n/)) {
      if (isUnixBoundary(patch)) patch = unixToWinBoundary(patch);
    } else if (!source.includes('\r\n') && source.includes('\n') && isWinBoundary(patch)) {
      patch = winToUnixBoundary(patch);
    }
  }
  return patch;
}

export function fuzzFactorBoundary(options) {
  if (options === undefined) options = {};
  return options.fuzzFactor;
}

export function reversePatchBoundary(structuredPatch) {
  if (Array.isArray(structuredPatch)) {
    return structuredPatch.map(patch => reversePatchBoundary(patch)).reverse();
  }
  const reversed = Object.assign(Object.assign({}, structuredPatch), {
    oldFileName: structuredPatch.isGit ? structuredPatch.newFileName : structuredPatch.newFileName,
    oldHeader: structuredPatch.newHeader,
    newFileName: structuredPatch.isGit ? structuredPatch.oldFileName : structuredPatch.oldFileName,
    newHeader: structuredPatch.oldHeader,
    oldMode: structuredPatch.newMode,
    newMode: structuredPatch.oldMode,
    isCreate: structuredPatch.isDelete,
    isDelete: structuredPatch.isCreate,
    hunks: structuredPatch.hunks.map(hunk => ({
      oldLines: hunk.newLines,
      oldStart: hunk.newStart,
      newLines: hunk.oldLines,
      newStart: hunk.oldStart,
      lines: hunk.lines.map(line =>
        line.startsWith('-')
          ? `+${line.slice(1)}`
          : line.startsWith('+')
            ? `-${line.slice(1)}`
            : line
      ),
    })),
  });
  structuredPatch.isCopy;
  return reversed;
}

export function unixToWinBoundary(patch) {
  if (Array.isArray(patch)) return patch.map(value => unixToWinBoundary(value));
  return Object.assign(Object.assign({}, patch), {
    hunks: patch.hunks.map(hunk =>
      Object.assign(Object.assign({}, hunk), {
        lines: hunk.lines.map((line, index) =>
          line.startsWith('\\') || line.endsWith('\r') || hunk.lines[index + 1]?.startsWith('\\')
            ? line
            : line + '\r'
        ),
      })
    ),
  });
}

export function winToUnixBoundary(patch) {
  if (Array.isArray(patch)) return patch.map(value => winToUnixBoundary(value));
  return Object.assign(Object.assign({}, patch), {
    hunks: patch.hunks.map(hunk =>
      Object.assign(Object.assign({}, hunk), {
        lines: hunk.lines.map(line =>
          line.endsWith('\r') ? line.substring(0, line.length - 1) : line
        ),
      })
    ),
  });
}

export function isUnixBoundary(patch) {
  if (!Array.isArray(patch)) patch = [patch];
  return !patch.some(index =>
    index.hunks.some(hunk => hunk.lines.some(line => !line.startsWith('\\') && line.endsWith('\r')))
  );
}

export function isWinBoundary(patch) {
  if (!Array.isArray(patch)) patch = [patch];
  return (
    patch.some(index => index.hunks.some(hunk => hunk.lines.some(line => line.endsWith('\r')))) &&
    patch.every(index =>
      index.hunks.every(hunk =>
        hunk.lines.every(
          (line, lineIndex) =>
            line.startsWith('\\') ||
            line.endsWith('\r') ||
            hunk.lines[lineIndex + 1]?.startsWith('\\')
        )
      )
    )
  );
}

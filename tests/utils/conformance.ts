import { expect } from 'bun:test';

type ObservableOutcome = { kind: 'returned'; value: unknown } | { kind: 'threw'; error: unknown };

function captureOutcome(operation: () => unknown): ObservableOutcome {
  try {
    return { kind: 'returned', value: operation() };
  } catch (error) {
    return {
      kind: 'threw',
      error:
        error instanceof Error
          ? { kind: 'error', name: error.name, message: error.message }
          : { kind: 'value', value: error },
    };
  }
}

export function expectSameObservableBehavior(
  localOperation: () => unknown,
  referenceOperation: () => unknown
): void {
  const local = captureOutcome(localOperation);
  const reference = captureOutcome(referenceOperation);

  expect(local).toStrictEqual(reference);
}

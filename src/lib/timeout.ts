/** Rejection used when withTimeout's deadline wins the race. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Race `promise` against a deadline. Rejects with TimeoutError (after
 * calling `onTimeout`, e.g. to interrupt in-flight work) when the
 * deadline passes. The underlying promise's late result is dropped and
 * its late rejection is swallowed, so it can't surface unhandled.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      promise.catch(() => {});
      try {
        onTimeout?.();
      } catch {
        // A failing interrupt must not mask the timeout itself.
      }
      reject(new TimeoutError(ms));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

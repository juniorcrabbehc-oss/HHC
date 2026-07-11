/**
 * Builds a shallow `{ field: { from, to } }` diff for the keys present on
 * `patch`, comparing against `before`. Used to populate `AuditLog.diff`.
 * Only reports keys whose value actually changed.
 */
export function shallowDiff<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (patch[key] === undefined) continue;
    const beforeValue = before[key];
    const afterValue = patch[key];
    const beforeComparable = beforeValue instanceof Date ? beforeValue.toISOString() : beforeValue;
    const afterComparable = afterValue instanceof Date ? afterValue.toISOString() : afterValue;

    if (beforeComparable !== afterComparable) {
      diff[key as string] = { from: beforeValue, to: afterValue };
    }
  }

  return diff;
}

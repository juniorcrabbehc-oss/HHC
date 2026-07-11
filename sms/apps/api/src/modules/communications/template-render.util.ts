/**
 * Replaces `{{key}}` placeholders in a template body with values from
 * `vars`. Unknown placeholders resolve to an empty string rather than
 * being left literally in the output — a missing var is more likely a
 * stale/typo'd template than something an SMS recipient should see raw
 * `{{...}}` markup for.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

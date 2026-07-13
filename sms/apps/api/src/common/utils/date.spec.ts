import { toDateOnly } from "./date";

describe("toDateOnly", () => {
  it("normalizes a plain date-only string to midnight UTC", () => {
    expect(toDateOnly("2026-07-11").toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  it("normalizes a full ISO timestamp string to the same calendar day", () => {
    expect(toDateOnly("2026-07-11T15:45:30.123Z").toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  it("accepts a Date instance and strips the time-of-day", () => {
    expect(toDateOnly(new Date("2026-07-11T23:59:59.999Z")).toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  it("makes different representations of the same day compare equal", () => {
    const a = toDateOnly("2026-07-11");
    const b = toDateOnly("2026-07-11T08:00:00.000Z");
    const c = toDateOnly(new Date("2026-07-11T01:02:03.000Z"));
    expect(a.getTime()).toBe(b.getTime());
    expect(b.getTime()).toBe(c.getTime());
  });

  it("is idempotent", () => {
    const once = toDateOnly("2026-07-11");
    expect(toDateOnly(once).getTime()).toBe(once.getTime());
  });
});

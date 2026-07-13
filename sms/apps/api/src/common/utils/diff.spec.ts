import { shallowDiff } from "./diff";

describe("shallowDiff", () => {
  it("reports only keys whose value actually changed", () => {
    const before = { firstName: "Ama", lastName: "Mensah", status: "active" };
    const patch = { firstName: "Ama", lastName: "Owusu" };

    expect(shallowDiff(before, patch)).toEqual({
      lastName: { from: "Mensah", to: "Owusu" },
    });
  });

  it("returns an empty object when nothing changed", () => {
    const before = { a: 1, b: "x" };
    expect(shallowDiff(before, { a: 1, b: "x" })).toEqual({});
    expect(shallowDiff(before, {})).toEqual({});
  });

  it("skips keys whose patch value is undefined", () => {
    const before = { a: 1 as number | undefined, b: 2 };
    expect(shallowDiff(before, { a: undefined, b: 3 })).toEqual({
      b: { from: 2, to: 3 },
    });
  });

  it("ignores before-keys that are absent from the patch", () => {
    const before = { keep: "same", other: "untouched" };
    expect(shallowDiff(before, { keep: "changed" })).toEqual({
      keep: { from: "same", to: "changed" },
    });
  });

  it("treats Dates representing the same instant as equal", () => {
    const before = { dob: new Date("2015-03-01T00:00:00.000Z") };
    expect(shallowDiff(before, { dob: new Date("2015-03-01T00:00:00.000Z") })).toEqual({});
  });

  it("reports changed Dates with the original Date values as from/to", () => {
    const from = new Date("2015-03-01T00:00:00.000Z");
    const to = new Date("2016-04-02T00:00:00.000Z");
    expect(shallowDiff({ dob: from }, { dob: to })).toEqual({
      dob: { from, to },
    });
  });

  it("catches null <-> value transitions", () => {
    expect(shallowDiff({ notes: null as string | null }, { notes: "asthma" })).toEqual({
      notes: { from: null, to: "asthma" },
    });
  });
});

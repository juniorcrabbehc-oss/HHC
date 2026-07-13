import { renderTemplate } from "./template-render.util";

describe("renderTemplate", () => {
  it("replaces {{key}} placeholders with the supplied vars", () => {
    expect(renderTemplate("Dear {{guardianName}}, {{learnerName}} was absent.", {
      guardianName: "Mr Mensah",
      learnerName: "Ama",
    })).toBe("Dear Mr Mensah, Ama was absent.");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ name }}!", { name: "Kofi" })).toBe("Hi Kofi!");
  });

  it("replaces repeated occurrences of the same placeholder", () => {
    expect(renderTemplate("{{x}} and {{x}}", { x: "again" })).toBe("again and again");
  });

  it("resolves missing placeholders to an empty string, not literal markup", () => {
    const out = renderTemplate("Balance: {{amount}} due {{dueDate}}", { amount: "GHS 50" });
    expect(out).toBe("Balance: GHS 50 due ");
    expect(out).not.toContain("{{");
  });

  it("leaves templates without placeholders untouched", () => {
    expect(renderTemplate("No placeholders here.", { unused: "x" })).toBe("No placeholders here.");
  });
});

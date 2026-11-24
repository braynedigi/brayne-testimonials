import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The form script is a static public asset, so its contract is audited the
 * way the widget is: the endpoint it posts to, the prefill it reads, and
 * the rules that keep it safe on a page (text assignments only, no markup
 * sink).
 */

const packageRoot = path.dirname(
  fileURLToPath(new URL("../../package.json", import.meta.url)),
);
const script = readFileSync(
  path.join(packageRoot, "public", "review-form.js"),
  "utf8",
);

describe("review-form.js asset audit", () => {
  it("posts to the plugin's own submit route", () => {
    expect(script).toContain("/api/brayne-testimonials/submit");
  });

  it("prefills name and role from the invitation link", () => {
    expect(script).toContain("URLSearchParams");
    expect(script).toContain('query.get("name")');
    expect(script).toContain('query.get("role")');
    /** The values land in the inputs by assignment, bounded like the server. */
    expect(script).toContain(".value = String(nameParam).slice(0, 60)");
    expect(script).toContain(".value = String(roleParam).slice(0, 80)");
  });

  it("carries the rendered page language as the review's locale", () => {
    expect(script).toContain("document.documentElement.lang");
    expect(script).toContain("payload.locale");
    /** Bounded like the server's own field, and never required. */
    expect(script).toContain("String(pageLang).slice(0, 40)");
  });

  it("never writes markup: no innerHTML, insertAdjacentHTML, or eval", () => {
    expect(script).not.toContain("innerHTML");
    expect(script).not.toContain("insertAdjacentHTML");
    expect(script).not.toContain("document.write");
    expect(script).not.toContain("eval(");
    expect(script).not.toContain("new Function");
  });
});

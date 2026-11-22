import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  buildSettings,
  resolveColumns,
  resolveLayout,
  resolveSource,
  resolveStyle,
  validateSettingsUpdate,
} from "../../src/settings.js";

/**
 * The settings form saves through the plugin's own write route, so every rule
 * that gate applies has to hold here: defaults match the manifest, unknown
 * keys are ignored, and each known key accepts exactly the documented values.
 */

const packageRoot = path.dirname(
  fileURLToPath(new URL("../../package.json", import.meta.url)),
);

function manifestSchema(): Record<string, { default?: unknown }> {
  const manifest = JSON.parse(
    readFileSync(path.join(packageRoot, "justflows.json"), "utf8"),
  ) as {
    settingsSchema: Record<string, { default?: unknown }>;
  };
  return manifest.settingsSchema;
}

describe("settings defaults", () => {
  it("match the manifest schema defaults key for key", () => {
    const schema = manifestSchema();
    expect(Object.keys(schema).sort()).toEqual([...SETTING_KEYS].sort());
    for (const key of SETTING_KEYS) {
      expect(SETTING_DEFAULTS[key]).toEqual(schema[key]?.default);
    }
  });
});

describe("buildSettings", () => {
  it("fills every key from the defaults when nothing is stored", () => {
    const built = buildSettings({});
    expect(built.notifyEmail).toBe("");
    expect(built.requireCaptcha).toBe(true);
    expect(built.minRatingToDisplay).toBe(0);
    expect(built.collectionUrl).toBe("");
  });

  it("resolves stored values into the documented shapes", () => {
    const built = buildSettings({
      notifyEmail: " support@example.com ",
      requireCaptcha: false,
      minRatingToDisplay: "4",
    });
    expect(built.notifyEmail).toBe("support@example.com");
    expect(built.requireCaptcha).toBe(false);
    expect(built.minRatingToDisplay).toBe(4);
  });

  it("falls back on unknown or absent values instead of inventing state", () => {
    const built = buildSettings({
      notifyEmail: 42,
      minRatingToDisplay: "9",
    });
    expect(built.notifyEmail).toBe("");
    expect(built.minRatingToDisplay).toBe(0);
  });
});

describe("resolvers", () => {
  it("keep layouts, columns, styles, and sources to their documented sets", () => {
    expect(resolveLayout("slider")).toBe("slider");
    expect(resolveLayout("unknown")).toBe("grid");
    expect(resolveColumns("2")).toBe("2");
    expect(resolveColumns("5")).toBe("3");
    expect(resolveStyle("minimal")).toBe("minimal");
    expect(resolveStyle("fancy")).toBe("cards");
    expect(resolveSource("featured")).toBe("featured");
    expect(resolveSource("pinned")).toBe("all");
  });
});

describe("validateSettingsUpdate", () => {
  it("accepts a full valid save and keeps only what was sent", () => {
    const checked = validateSettingsUpdate({
      notifyEmail: "support@example.com",
      requireCaptcha: false,
      minRatingToDisplay: 3,
      collectionUrl: "/reviews",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(Object.keys(checked.values).length).toBe(SETTING_KEYS.length);
  });

  it("ignores unknown keys instead of rejecting the save", () => {
    const checked = validateSettingsUpdate({
      requireCaptcha: false,
      injected: "<script>",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.values).toEqual({ requireCaptcha: false });
  });

  it("accepts an empty object as a no-op", () => {
    expect(validateSettingsUpdate({})).toEqual({ ok: true, values: {} });
  });

  it("rejects a body that is not a settings object", () => {
    for (const body of [null, "settings", 42, []]) {
      expect(validateSettingsUpdate(body).ok).toBe(false);
    }
  });

  it("requires real booleans for the toggles", () => {
    const checkedBad = validateSettingsUpdate({ requireCaptcha: "true" });
    expect(checkedBad.ok).toBe(false);
    const checked = validateSettingsUpdate({ requireCaptcha: false });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.values.requireCaptcha).toBe(false);
  });

  it("checks the email, allowing empty but not malformed addresses", () => {
    expect(validateSettingsUpdate({ notifyEmail: "" }).ok).toBe(true);
    expect(
      validateSettingsUpdate({ notifyEmail: "support@example.com" }).ok,
    ).toBe(true);
    for (const bad of ["not-an-email", "a@b", "a b@example.com"]) {
      const checked = validateSettingsUpdate({ notifyEmail: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("notifyEmail");
    }
  });

  it("keeps the minimum rating to its documented choices, and ignores the removed layout keys", () => {
    expect(validateSettingsUpdate({ minRatingToDisplay: 6 }).ok).toBe(false);
    expect(validateSettingsUpdate({ minRatingToDisplay: "0" }).ok).toBe(true);
    /**
     * `defaultLayout` and `columns` stopped being settings: a block's layout
     * lives with the block. An old client still sending them must not break,
     * and must not have them honoured either.
     */
    const legacy = validateSettingsUpdate({
      defaultLayout: "feature",
      columns: "4",
    });
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(legacy.values).toEqual({});
  });

  it("accepts a same-origin page address for the collection link", () => {
    expect(validateSettingsUpdate({ collectionUrl: "" }).ok).toBe(true);
    expect(validateSettingsUpdate({ collectionUrl: "/reviews" }).ok).toBe(true);
    expect(
      validateSettingsUpdate({ collectionUrl: "https://example.com/reviews" })
        .ok,
    ).toBe(true);
    for (const bad of [
      '" onclick="1',
      "javascript:alert(1)",
      "no spaces allowed here",
    ]) {
      const checked = validateSettingsUpdate({ collectionUrl: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("collectionUrl");
    }
  });
});

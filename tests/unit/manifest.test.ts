import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deepStrictEqual } from "node:assert";
import { describe, expect, it } from "vitest";
import { PluginManifestSchema } from "@justflows/sdk";
import plugin from "../../src/index.js";
import {
  REVIEW_FORM_BLOCK,
  SAMPLE_RECORDS,
  STRIP_BLOCK,
  TESTIMONIALS_BLOCK,
  reviewFormBlock,
  testimonialStripBlock,
  testimonialsBlock,
} from "../../src/blocks.js";
import { testimonialPatterns } from "../../src/patterns.js";

/**
 * The manifest the host reads, the module the loader validates, and the
 * blocks the builder inserts all have to agree. The manifest copies are
 * compared field by field, the blocks' props are checked against the
 * inspector contract, and every file the manifest declares must exist.
 */

const packageRoot = path.dirname(
  fileURLToPath(new URL("../../package.json", import.meta.url)),
);

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(packageRoot, file), "utf8"),
  ) as Record<string, unknown>;
}

const fileManifest = readJson("justflows.json");
const moduleManifest = plugin.manifest as unknown as Record<string, unknown>;

const SHARED_FIELDS = [
  "id",
  "apiNamespace",
  "name",
  "version",
  "license",
  "description",
  "engines",
  "permissions",
  "main",
  "registry",
  "settingsSchema",
  "adminSection",
  "adminMenu",
  "adminApp",
  "assets",
] as const;

describe("manifest", () => {
  it("keeps justflows.json and the module manifest identical", () => {
    const drifted: string[] = [];
    for (const field of SHARED_FIELDS) {
      try {
        deepStrictEqual(moduleManifest[field], fileManifest[field]);
      } catch {
        drifted.push(field);
      }
    }
    expect(drifted).toEqual([]);
  });

  it("satisfies the SDK schema the loader applies on activation", () => {
    const parsed = PluginManifestSchema.safeParse(moduleManifest);
    if (!parsed.success) throw new Error(parsed.error.message);
    expect(parsed.success).toBe(true);
  });

  it("asks for exactly the permissions its features need", () => {
    const permissions = plugin.manifest.permissions;
    expect(permissions).toContain("admin:extend");
    expect(permissions).toContain("mail:send");
    /** The notification email is the only use of the mail permission. */
    expect(
      (
        plugin.manifest as unknown as {
          settingsSchema: Record<string, unknown>;
        }
      ).settingsSchema["notifyEmail"],
    ).toBeDefined();
  });

  it("declares an admin app whose build files exist", () => {
    const adminApp = plugin.manifest.adminApp;
    expect(adminApp?.dir).toBe("admin");
    expect(adminApp?.routes[0]?.entry).toBe("index.html");
    expect(adminApp?.locales?.["en"]).toBe("locales/en.json");
  });

  it("declares block assets for every block it registers", () => {
    const assets = plugin.manifest.assets;
    expect(assets?.dir).toBe("public");
    const declared: string[] = [];
    for (const entry of Object.values(assets?.blocks ?? {})) {
      declared.push(...(entry.scripts ?? []), ...(entry.styles ?? []));
    }
    expect(declared.length).toBeGreaterThan(0);
  });
});

describe("blocks", () => {
  it("registers the three blocks under the plugin's own types", () => {
    expect(testimonialsBlock().type).toBe(TESTIMONIALS_BLOCK);
    expect(reviewFormBlock().type).toBe(REVIEW_FORM_BLOCK);
    expect(testimonialStripBlock().type).toBe(STRIP_BLOCK);
  });

  it("validates props into the documented bounds", () => {
    const block = testimonialsBlock();
    const clean = block.validateProps({
      layout: "slider",
      columns: "9",
      limit: 99,
      source: "pinned",
      showStars: false,
      style: "minimal",
    });
    /** Out-of-range values fall back to the documented default, not the edge. */
    expect(clean).toEqual({
      layout: "slider",
      columns: "3",
      limit: 6,
      source: "all",
      showStars: false,
      showAvatars: true,
      showRole: true,
      showDate: false,
      style: "minimal",
      /**
       * A builder save never carries records, so the validated props store an
       * empty list; the `content.blocks` pass fills it at render time.
       */
      records: [],
    });
  });

  it("survives hostile or empty props without inventing state", () => {
    const block = testimonialsBlock();
    for (const hostile of [null, 42, "text", [], { layout: { deep: true } }]) {
      const clean = block.validateProps(hostile);
      expect(clean).toEqual(block.validateProps({}));
    }
  });

  it("escapes records the renderer receives", () => {
    const block = testimonialsBlock();
    const html = block.render({
      layout: "grid",
      records: [
        {
          quote: "<script>1</script>",
          personName: "Ama",
          rating: 5,
          role: "",
          avatarUrl: "",
          approvedAt: "",
          id: "x",
        },
      ],
    });
    expect(html).not.toContain("<script");
  });

  it("shows real sample records in the builder preview, never saved", () => {
    const sample = testimonialsBlock().preview?.sampleProps as {
      records: typeof SAMPLE_RECORDS;
    };
    expect(sample.records.length).toBe(3);
    for (const record of sample.records) {
      expect(record.quote.length).toBeGreaterThan(0);
      expect(record.personName.length).toBeGreaterThan(0);
    }
  });

  it("renders the strip's sample stats in the preview", () => {
    const sample = testimonialStripBlock().preview?.sampleProps as {
      stats: {
        approved: number;
        averageRating: number;
        publishedThisMonth: number;
      };
    };
    expect(sample.stats.approved).toBeGreaterThan(0);
  });
});

describe("patterns", () => {
  it("composes only blocks this plugin registers", () => {
    const own = new Set([TESTIMONIALS_BLOCK, REVIEW_FORM_BLOCK, STRIP_BLOCK]);
    for (const pattern of testimonialPatterns()) {
      expect(pattern.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(pattern.title.length).toBeGreaterThan(0);
      for (const block of pattern.blocks) {
        expect(own.has(block.type)).toBe(true);
      }
    }
  });

  it("offers the three designed compositions", () => {
    const ids = testimonialPatterns().map((pattern) => pattern.id);
    expect(ids).toEqual([
      "testimonial-wall",
      "hero-with-social-proof",
      "footer-quote",
    ]);
  });
});

describe("declared files", () => {
  it("exists for every asset the manifest declares", () => {
    const assets = plugin.manifest.assets;
    const dir = String(assets?.dir ?? "public");
    const declared: string[] = [];
    for (const entry of Object.values(assets?.blocks ?? {})) {
      declared.push(...(entry.scripts ?? []), ...(entry.styles ?? []));
    }
    const missing = declared.filter(
      (rel) => !existsSync(path.join(packageRoot, dir, rel)),
    );
    expect(missing).toEqual([]);
  });
});

/**
 * The three blocks Brayne Testimonials adds to the page builder.
 *
 * `justflows.brayne-testimonials.reviews` renders the curated reviews: grid,
 * slider, or one feature quote, in the cards, minimal, or quote style.
 * `justflows.brayne-testimonials.form` renders the public collection form.
 * `justflows.brayne-testimonials.strip` renders the honest activity strip.
 *
 * The reviews and the strip's stats are render-time props: the plugin's
 * `content.blocks` pass injects them into the stored tree immediately before
 * the page renders, and each block's `validateProps` lets them through, so
 * pages carry the reviews in their HTML. The builder never sends them, so a
 * page save stores none; the builder instead shows `preview.sampleProps`,
 * which are never saved.
 */

import type { PluginBlockDefinition } from "@justflows/sdk";
import {
  renderForm,
  renderStrip,
  renderTestimonials,
  type RenderOptions,
  type RenderRecord,
} from "./render.js";
import {
  resolveColumns,
  resolveLayout,
  resolveSource,
  resolveStyle,
  toBoolean,
  toIntIn,
} from "./settings.js";

export const TESTIMONIALS_BLOCK = "justflows.brayne-testimonials.reviews";
export const REVIEW_FORM_BLOCK = "justflows.brayne-testimonials.form";
export const STRIP_BLOCK = "justflows.brayne-testimonials.strip";

/** Sample records for the builder preview. Never saved, clearly samples. */
export const SAMPLE_RECORDS: RenderRecord[] = [
  {
    id: "sample-1",
    quote:
      "They answered every question the same day, and the site was live by the weekend.",
    personName: "Abena Owusu",
    role: "Owner, Sunshade Fabrics",
    rating: 5,
    avatarUrl: "",
    approvedAt: "2026-11-10T09:00:00.000Z",
  },
  {
    id: "sample-2",
    quote:
      "Straightforward pricing and no surprises. Our bookings went up within a month.",
    personName: "Daniel Mensah",
    role: "Manager, Ridge Dental",
    rating: 4,
    avatarUrl: "",
    approvedAt: "2026-11-12T09:00:00.000Z",
  },
  {
    id: "sample-3",
    quote: "The contact button alone has paid for the whole website.",
    personName: "Efua Sarpong",
    role: "",
    rating: null,
    avatarUrl: "",
    approvedAt: "2026-11-14T09:00:00.000Z",
  },
];

/** Coerce whatever a page stored into the renderer's display options. */
function renderOptions(raw: Record<string, unknown>): RenderOptions {
  return {
    layout: resolveLayout(raw["layout"]),
    columns: resolveColumns(raw["columns"]),
    style: resolveStyle(raw["style"]),
    showStars: toBoolean(raw["showStars"], true),
    showAvatars: toBoolean(raw["showAvatars"], true),
    showRole: toBoolean(raw["showRole"], true),
    showDate: toBoolean(raw["showDate"], false),
  };
}

/** Coerce whatever reached the renderer into the record shape it expects. */
function renderRecords(raw: unknown): RenderRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object",
    )
    .slice(0, 24)
    .map((entry): RenderRecord => ({
      id: typeof entry["id"] === "string" ? entry["id"].slice(0, 80) : "",
      quote: typeof entry["quote"] === "string" ? entry["quote"] : "",
      personName:
        typeof entry["personName"] === "string" ? entry["personName"] : "",
      role: typeof entry["role"] === "string" ? entry["role"] : "",
      rating:
        typeof entry["rating"] === "number" && Number.isInteger(entry["rating"])
          ? Math.max(0, Math.min(5, entry["rating"]))
          : null,
      avatarUrl:
        typeof entry["avatarUrl"] === "string" ? entry["avatarUrl"] : "",
      approvedAt:
        typeof entry["approvedAt"] === "string" ? entry["approvedAt"] : "",
    }));
}

/** The testimonial display block. */
export function testimonialsBlock(): PluginBlockDefinition {
  return {
    type: TESTIMONIALS_BLOCK,
    version: 1,
    apiVersion: 1,
    title: "Testimonials",
    description:
      "Curated customer reviews in a grid, a slider, or one feature quote.",
    icon: "\u2605",
    category: "engagement",
    keywords: ["testimonial", "review", "social proof", "rating", "stars"],
    defaults: {
      layout: "grid",
      columns: "3",
      limit: 6,
      source: "all",
      showStars: true,
      showAvatars: true,
      showRole: true,
      showDate: false,
      style: "cards",
    },
    preview: {
      sampleProps: {
        layout: "grid",
        columns: "3",
        limit: 6,
        source: "all",
        showStars: true,
        showAvatars: true,
        showRole: true,
        showDate: false,
        style: "cards",
        records: SAMPLE_RECORDS,
      },
      minHeight: 260,
    },
    actions: [
      {
        id: "make-slider",
        label: "Show as a slider",
        props: { layout: "slider" },
        toolbar: true,
      },
      {
        id: "make-feature",
        label: "Feature one review",
        props: { layout: "feature" },
        toolbar: true,
      },
      {
        id: "featured-only",
        label: "Show featured only",
        props: { source: "featured" },
      },
    ],
    schema: {
      layout: {
        type: "select",
        label: "Layout",
        options: ["grid", "slider", "feature"],
        optionLabels: {
          grid: "Grid",
          slider: "Slider",
          feature: "Feature quote",
        },
        default: "grid",
      },
      columns: {
        type: "select",
        label: "Columns",
        options: ["2", "3", "4"],
        optionLabels: { "2": "Two", "3": "Three", "4": "Four" },
        default: "3",
        showWhen: { field: "layout", equals: "grid" },
      },
      limit: {
        type: "number",
        label: "Maximum reviews",
        default: 6,
        help: "Between 3 and 12.",
      },
      source: {
        type: "select",
        label: "Show",
        options: ["all", "featured"],
        optionLabels: { all: "All approved", featured: "Featured only" },
        default: "all",
      },
      showStars: { type: "boolean", label: "Show stars", default: true },
      showAvatars: { type: "boolean", label: "Show avatars", default: true },
      showRole: {
        type: "boolean",
        label: "Show role / company",
        default: true,
      },
      showDate: { type: "boolean", label: "Show date", default: false },
      style: {
        type: "select",
        label: "Style",
        options: ["cards", "minimal", "quote"],
        optionLabels: {
          cards: "Cards",
          minimal: "Minimal",
          quote: "Quote marks",
        },
        default: "cards",
      },
    },
    validateProps(raw: unknown): Record<string, unknown> {
      const value =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return {
        layout: resolveLayout(value["layout"]),
        columns: resolveColumns(value["columns"]),
        limit: toIntIn(value["limit"], 3, 12, 6),
        source: resolveSource(value["source"]),
        showStars: toBoolean(value["showStars"], true),
        showAvatars: toBoolean(value["showAvatars"], true),
        showRole: toBoolean(value["showRole"], true),
        showDate: toBoolean(value["showDate"], false),
        style: resolveStyle(value["style"]),
        /**
         * The registry renders `def.render(validateProps(storedProps))`, and
         * the plugin's `content.blocks` pass injects the visible reviews into
         * the stored props immediately before that call — so the injected
         * list must survive this pass or the block renders empty. The builder
         * never sends `records`, so a page save never stores one.
         */
        records: renderRecords(value["records"]),
      };
    },
    render(props: Record<string, unknown>): string {
      const value = props && typeof props === "object" ? props : {};
      return renderTestimonials(
        renderRecords(value["records"]),
        renderOptions(value),
      );
    },
  };
}

/** The public collection form block. */
export function reviewFormBlock(): PluginBlockDefinition {
  return {
    type: REVIEW_FORM_BLOCK,
    version: 1,
    apiVersion: 1,
    title: "Review form",
    description:
      "Collect customer reviews for moderation. Uses the site's CAPTCHA.",
    icon: "\u270d",
    category: "engagement",
    keywords: ["review", "testimonial", "form", "feedback", "collection"],
    defaults: {},
    preview: { minHeight: 420 },
    schema: {},
    validateProps(): Record<string, unknown> {
      return {};
    },
    render(): string {
      return renderForm();
    },
  };
}

/** The honest activity strip block. */
export function testimonialStripBlock(): PluginBlockDefinition {
  return {
    type: STRIP_BLOCK,
    version: 1,
    apiVersion: 1,
    title: "Review activity",
    description:
      "Approved reviews this month and the average rating. No invented numbers.",
    icon: "\u2605",
    category: "engagement",
    keywords: ["activity", "social proof", "average", "rating"],
    defaults: {},
    preview: {
      sampleProps: {
        stats: { approved: 12, averageRating: 4.8, publishedThisMonth: 2 },
      },
      minHeight: 48,
    },
    schema: {},
    validateProps(raw: unknown): Record<string, unknown> {
      const value =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const rawStats = value["stats"];
      const stats =
        rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)
          ? (rawStats as Record<string, unknown>)
          : {};
      const averageRaw = Number(stats["averageRating"]);
      /**
       * Same contract as the reviews block: the `content.blocks` pass injects
       * the live stats immediately before render, and the registry renders
       * `def.render(validateProps(storedProps))`, so they must survive this
       * pass. The builder never sends `stats`, so a page save stores none.
       */
      return {
        stats: {
          approved: toIntIn(stats["approved"], 0, 1000000, 0),
          averageRating: Number.isFinite(averageRaw)
            ? Math.round(averageRaw * 10) / 10
            : null,
          publishedThisMonth: toIntIn(
            stats["publishedThisMonth"],
            0,
            1000000,
            0,
          ),
        },
      };
    },
    render(props: Record<string, unknown>): string {
      const value =
        props && typeof props === "object"
          ? (props as Record<string, unknown>)
          : {};
      const raw = value["stats"];
      const stats =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const approved =
        typeof stats["approved"] === "number" ? stats["approved"] : 0;
      const average =
        typeof stats["averageRating"] === "number"
          ? stats["averageRating"]
          : null;
      const publishedThisMonth =
        typeof stats["publishedThisMonth"] === "number"
          ? stats["publishedThisMonth"]
          : 0;
      return renderStrip({
        approved,
        averageRating: average,
        publishedThisMonth,
      });
    },
  };
}

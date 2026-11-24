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

/**
 * Sample records for the builder preview, copied from the design file's own
 * sample cards. Never saved, clearly samples.
 */
export const SAMPLE_RECORDS: RenderRecord[] = [
  {
    id: "sample-1",
    quote:
      "They rebuilt our booking page in two weeks and orders went up the very next month. Clear updates the whole way through.",
    personName: "Maria Santos",
    role: "Owner, Sample Bakery",
    rating: 5,
    avatarUrl: "",
    ownerReply: "",
    verified: true,
    photoUrl: "",
    videoUrl: "",
    approvedAt: "2026-11-10T09:00:00.000Z",
  },
  {
    id: "sample-2",
    quote:
      "Support answers every question the same day. The dashboard saves our small team hours every single week.",
    personName: "Daniel Reyes",
    role: "Operations Lead, Example Logistics",
    rating: 5,
    avatarUrl: "",
    ownerReply: "",
    verified: false,
    photoUrl: "",
    videoUrl: "",
    approvedAt: "2026-11-12T09:00:00.000Z",
  },
  {
    id: "sample-3",
    quote:
      "Our menu updates now take minutes instead of a phone call. Customers noticed the difference straight away.",
    personName: "Kofi Mensah",
    role: "Manager, Placeholder Cafe",
    rating: 4,
    avatarUrl: "",
    ownerReply: "",
    verified: false,
    photoUrl: "",
    videoUrl: "",
    approvedAt: "2026-11-14T09:00:00.000Z",
  },
  {
    id: "sample-4",
    quote:
      "Friendly team, honest advice and no upselling. They told us what we did not need, which saved us money.",
    personName: "Ana Cruz",
    role: "Founder, Demo Studio",
    rating: 5,
    avatarUrl: "",
    ownerReply: "",
    verified: false,
    photoUrl: "",
    videoUrl: "",
    approvedAt: "2026-11-16T09:00:00.000Z",
  },
  {
    id: "sample-5",
    quote:
      "Good result overall. The first draft missed our tone, but the second round was spot on and delivered on time.",
    personName: "Lea Navarro",
    role: "Marketing, Sample Clinic",
    rating: 4,
    avatarUrl: "",
    ownerReply: "",
    verified: false,
    photoUrl: "",
    videoUrl: "",
    approvedAt: "2026-11-18T09:00:00.000Z",
  },
  {
    id: "sample-6",
    quote:
      "Booked our first customer through the new form on day one. Simple to use and it looks great on phones.",
    personName: "Sam Torres",
    role: "Owner, Example Garage",
    rating: 5,
    avatarUrl: "",
    ownerReply: "",
    verified: true,
    photoUrl: "",
    videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    approvedAt: "2026-11-20T09:00:00.000Z",
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
    autoplay: toBoolean(raw["autoplay"], false),
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
      photoUrl: typeof entry["photoUrl"] === "string" ? entry["photoUrl"] : "",
      videoUrl: typeof entry["videoUrl"] === "string" ? entry["videoUrl"] : "",
      ownerReply:
        typeof entry["ownerReply"] === "string" ? entry["ownerReply"] : "",
      verified: entry["verified"] === true,
      approvedAt:
        typeof entry["approvedAt"] === "string" ? entry["approvedAt"] : "",
    }));
}

/**
 * The testimonial display block. Layout and columns are the author's choice
 * per block, in the page builder's inspector; the static defaults are what
 * a newly inserted block starts from.
 */
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
      tag: "",
      showStars: true,
      showAvatars: true,
      showRole: true,
      showDate: false,
      autoplay: false,
      style: "cards",
    },
    preview: {
      sampleProps: {
        layout: "grid",
        columns: "3",
        limit: 6,
        source: "all",
        tag: "",
        showStars: true,
        showAvatars: true,
        showRole: true,
        showDate: false,
        autoplay: false,
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
      tag: {
        type: "text",
        label: "Show only this tag",
        help: 'Optional: one tag label, e.g. "Repairs". Empty shows every approved review.',
        default: "",
      },
      showStars: { type: "boolean", label: "Show stars", default: true },
      showAvatars: { type: "boolean", label: "Show avatars", default: true },
      showRole: {
        type: "boolean",
        label: "Show role / company",
        default: true,
      },
      showDate: { type: "boolean", label: "Show date", default: false },
      autoplay: {
        type: "boolean",
        label: "Autoplay the slider",
        help: "Advances every 6 seconds; pauses on hover and never runs under reduced motion.",
        default: false,
        showWhen: { field: "layout", equals: "slider" },
      },
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
        tag: typeof value["tag"] === "string" ? value["tag"].slice(0, 40) : "",
        showStars: toBoolean(value["showStars"], true),
        showAvatars: toBoolean(value["showAvatars"], true),
        showRole: toBoolean(value["showRole"], true),
        showDate: toBoolean(value["showDate"], false),
        autoplay: toBoolean(value["autoplay"], false),
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
    defaults: { variant: "pill" },
    preview: {
      sampleProps: {
        variant: "pill",
        stats: {
          approved: 12,
          averageRating: 4.8,
          publishedThisMonth: 2,
          ratingDistribution: [9, 2, 1, 0, 0],
        },
      },
      minHeight: 48,
    },
    schema: {
      variant: {
        type: "select",
        label: "Variant",
        options: ["pill", "detailed"],
        optionLabels: { pill: "Pill", detailed: "With rating bars" },
        default: "pill",
      },
    },
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
      const distributionRaw = stats["ratingDistribution"];
      const distribution = Array.isArray(distributionRaw)
        ? distributionRaw.map((entry) =>
            Math.max(0, Math.trunc(Number(entry)) || 0),
          )
        : [0, 0, 0, 0, 0];
      /**
       * Same contract as the reviews block: the `content.blocks` pass injects
       * the live stats immediately before render, and the registry renders
       * `def.render(validateProps(storedProps))`, so they must survive this
       * pass. The builder never sends `stats`, so a page save stores none.
       */
      return {
        variant: value["variant"] === "detailed" ? "detailed" : "pill",
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
          ratingDistribution: distribution.slice(0, 5),
        },
      };
    },
    render(props: Record<string, unknown>): string {
      const value =
        props && typeof props === "object"
          ? (props as Record<string, unknown>)
          : {};
      const variant = value["variant"] === "detailed" ? "detailed" : "pill";
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
      const distribution = Array.isArray(stats["ratingDistribution"])
        ? stats["ratingDistribution"].map((entry) =>
            Math.max(0, Math.trunc(Number(entry)) || 0),
          )
        : [];
      return renderStrip(
        {
          approved,
          averageRating: average,
          publishedThisMonth,
          ratingDistribution: distribution,
        },
        variant,
      );
    },
  };
}

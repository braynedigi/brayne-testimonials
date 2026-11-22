/**
 * Settings keys, defaults, and validation for Brayne Testimonials.
 *
 * Everything here is pure: the admin form stores what the operator sends, and
 * this module is the single place that decides what the rest of the plugin
 * accepts. The defaults mirror `justflows.json`, and a test pins them together
 * so the two cannot drift.
 *
 * Layout and column counts are deliberately NOT settings: a block's layout
 * is stored with the block itself, chosen in the page builder, and a
 * "default layout" setting next to it promised something the placed blocks
 * never followed, so it is gone.
 */

/** Plugin id. Must match `justflows.json` and the folder the host discovers. */
export const PLUGIN_ID = "justflows.brayne-testimonials";

/** Neutral plugin API namespace. Public routes are served under this. */
export const API_NAMESPACE = "brayne-testimonials";

/** Layouts a Testimonials block can render. */
export const LAYOUTS = ["grid", "slider", "feature"] as const;
export type Layout = (typeof LAYOUTS)[number];

/** Column counts the grid layout supports. */
export const COLUMNS = ["2", "3", "4"] as const;
export type ColumnCount = (typeof COLUMNS)[number];

/** Style presets a Testimonials block can render. */
export const STYLES = ["cards", "minimal", "quote"] as const;
export type StylePreset = (typeof STYLES)[number];

/** Sources a displayed testimonial can come from. */
export const SOURCES = ["all", "featured"] as const;
export type BlockSource = (typeof SOURCES)[number];

/** Every settings key the admin form can show and the write route accepts. */
export const SETTING_KEYS = [
  "notifyEmail",
  "requireCaptcha",
  "minRatingToDisplay",
  "collectionUrl",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Settings values as the plugin uses them, already typed and bounded. */
export interface Settings {
  notifyEmail: string;
  requireCaptcha: boolean;
  /** 0 shows everything; 1-5 hides lower and unrated reviews. */
  minRatingToDisplay: number;
  /** The page that holds the review form, for the collection panel's link. */
  collectionUrl: string;
}

/** Raw `settingsSchema` rows as the admin stored them. */
export interface RawSettings {
  notifyEmail?: unknown;
  requireCaptcha?: unknown;
  minRatingToDisplay?: unknown;
  collectionUrl?: unknown;
}

const EMAIL_MAX = 200;
const URL_MAX = 500;
const MIN_RATINGS = ["0", "1", "2", "3", "4", "5"] as const;
/** A same-origin path or an absolute address, never script or quote tricks. */
const COLLECTION_URL_RE = /^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/;

/**
 * The `settingsSchema` defaults from `justflows.json`, applied for keys no one
 * has saved yet. `ctx.settings.get` returns `undefined` for keys nobody has
 * written, so defaults are applied here rather than in the client.
 */
export const SETTING_DEFAULTS: Record<SettingKey, string | boolean> = {
  notifyEmail: "",
  requireCaptcha: true,
  minRatingToDisplay: "0",
  collectionUrl: "",
};

/** Coerce a stored setting to a boolean, falling back when absent or unclear. */
export function toBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return fallback;
}

/** Coerce a stored setting to a bounded integer. */
export function toIntIn(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const value =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return Math.trunc(value);
}

/** A stored or submitted layout, or the default when unknown. */
export function resolveLayout(raw: unknown): Layout {
  return (LAYOUTS as readonly string[]).includes(String(raw))
    ? (raw as Layout)
    : "grid";
}

/** A stored or submitted column count, or the default when unknown. */
export function resolveColumns(raw: unknown): ColumnCount {
  return (COLUMNS as readonly string[]).includes(String(raw))
    ? (raw as ColumnCount)
    : "3";
}

/** A stored or submitted style preset, or the default when unknown. */
export function resolveStyle(raw: unknown): StylePreset {
  return (STYLES as readonly string[]).includes(String(raw))
    ? (raw as StylePreset)
    : "cards";
}

/** A stored or submitted source filter, or "all" when unknown. */
export function resolveSource(raw: unknown): BlockSource {
  return raw === "featured" ? "featured" : "all";
}

/** Raw stored rows into the typed settings view, with defaults applied. */
export function buildSettings(raw: RawSettings): Settings {
  return {
    notifyEmail:
      typeof raw.notifyEmail === "string"
        ? raw.notifyEmail.trim().slice(0, EMAIL_MAX)
        : "",
    requireCaptcha: toBoolean(
      raw.requireCaptcha,
      SETTING_DEFAULTS.requireCaptcha === true,
    ),
    minRatingToDisplay: (MIN_RATINGS as readonly string[]).includes(
      String(raw.minRatingToDisplay),
    )
      ? Number(String(raw.minRatingToDisplay))
      : 0,
    collectionUrl:
      typeof raw.collectionUrl === "string" &&
      COLLECTION_URL_RE.test(raw.collectionUrl.trim())
        ? raw.collectionUrl.trim().slice(0, URL_MAX)
        : "",
  };
}

/** Failed validation: which field, and the message the form shows under it. */
export interface SettingsError {
  ok: false;
  field: SettingKey | "";
  message: string;
}

export interface SettingsAccepted {
  ok: true;
  /** Only the known keys the caller sent, coerced and bounded. */
  values: Partial<Settings>;
}

export type SettingsValidation = SettingsAccepted | SettingsError;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Check one submitted settings object. Unknown keys are ignored; every known
 * key must pass its own rule. The client mirrors these rules for instant
 * feedback; this is the gate the server enforces.
 */
export function validateSettingsUpdate(body: unknown): SettingsValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      field: "",
      message: "Expected a JSON object of settings.",
    };
  }

  const submitted = body as Record<string, unknown>;
  const values: Partial<Settings> = {};
  let known = 0;

  for (const key of SETTING_KEYS) {
    if (!(key in submitted)) continue;
    known += 1;
    const raw = submitted[key];

    if (key === "notifyEmail") {
      if (typeof raw !== "string") {
        return { ok: false, field: key, message: "Expected text." };
      }
      const email = raw.trim();
      if (
        email.length > EMAIL_MAX ||
        (email.length > 0 && !EMAIL_RE.test(email))
      ) {
        return {
          ok: false,
          field: key,
          message:
            "Enter a valid email address, or leave it empty for no email.",
        };
      }
      values[key] = email;
      continue;
    }

    if (key === "requireCaptcha") {
      if (typeof raw !== "boolean") {
        return { ok: false, field: key, message: "Choose on or off." };
      }
      values[key] = raw;
      continue;
    }

    if (key === "minRatingToDisplay") {
      const value = toIntIn(raw, 0, 5, Number.NaN);
      if (!Number.isFinite(value)) {
        return {
          ok: false,
          field: key,
          message: "Choose a minimum between 0 and 5.",
        };
      }
      values[key] = value;
      continue;
    }

    if (key === "collectionUrl") {
      if (typeof raw !== "string") {
        return {
          ok: false,
          field: key,
          message: "Expected the address of the reviews page.",
        };
      }
      const url = raw.trim();
      if (
        url.length > URL_MAX ||
        (url.length > 0 && !COLLECTION_URL_RE.test(url))
      ) {
        return {
          ok: false,
          field: key,
          message:
            "Enter the page address on this site (for example /reviews), or leave it empty.",
        };
      }
      values[key] = url;
      continue;
    }
  }

  return { ok: true, values };
}

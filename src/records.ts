/**
 * The testimonial record model: validation, display selection, and stats.
 *
 * Everything here is pure so the routes stay thin and every rule has a test.
 * The shape follows the design contract exactly: `quote`, `personName`,
 * `role`, `rating` (optional), `avatarUrl`, `featuredAt` (empty = not
 * featured, newest pin first), `status` (pending until approved; only
 * approved records ever render), `consent`, `submittedAt`, and `source`.
 * `approvedAt` records when moderation accepted a review, which the date
 * display and the "published this month" count both use.
 */

const QUOTE_MAX = 500;
const NAME_MAX = 60;
const ROLE_MAX = 80;
const URL_MAX = 500;
const ID_MAX = 80;
const STATUS_VALUES = ["pending", "approved"] as const;
const SOURCE_VALUES = ["form", "manual"] as const;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const RECORD_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const AVATAR_URL_RE = /^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/;

/** One stored testimonial, already normalized for the plugin's own use. */
export interface TestimonialRecord {
  id: string;
  quote: string;
  personName: string;
  role: string;
  /** Integer 0-5, or null when the review is unrated. */
  rating: number | null;
  avatarUrl: string;
  /** ISO timestamp of the feature pin; empty means not featured. */
  featuredAt: string;
  status: (typeof STATUS_VALUES)[number];
  consent: boolean;
  /** ISO timestamp of the submission. */
  submittedAt: string;
  /** ISO timestamp of approval; empty while pending. */
  approvedAt: string;
  source: (typeof SOURCE_VALUES)[number];
}

/** Raw record rows as the admin stored them. */
export interface RawRecord {
  id?: unknown;
  quote?: unknown;
  personName?: unknown;
  role?: unknown;
  rating?: unknown;
  avatarUrl?: unknown;
  featuredAt?: unknown;
  status?: unknown;
  consent?: unknown;
  submittedAt?: unknown;
  approvedAt?: unknown;
  source?: unknown;
}

/** Failed validation: which field, and the message the form shows under it. */
export interface RecordError {
  ok: false;
  field: string;
  message: string;
}

export interface RecordAccepted {
  ok: true;
  /** Only the fields the caller sent, coerced and bounded. */
  values: Partial<RawRecord>;
}

export type RecordValidation = RecordAccepted | RecordError;

/** Trim, collapse inner whitespace runs, and cap the length. */
function cleanText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max);
}

/** A rating is a whole number 0-5, or empty for an unrated review. */
function resolveRating(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isInteger(value) || value < 0 || value > 5) return Number.NaN;
  return value;
}

/** An ISO timestamp the plugin accepts, or empty when the value is unusable. */
function resolveTimestamp(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (value.length > 40 || !ISO_RE.test(value)) return "";
  /** A date-shaped string that is not a real moment must not be stored. */
  return Number.isFinite(Date.parse(value)) ? value : "";
}

/**
 * Check one submitted record object. Unknown keys are ignored. The editor
 * route uses this for every field; the public form uses `validateSubmission`
 * instead, which only ever accepts the fields a visitor may set.
 */
export function validateRecord(body: unknown): RecordValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "", message: "Expected a JSON object of testimonial fields." };
  }

  const submitted = body as Record<string, unknown>;
  const values: Partial<RawRecord> = {};

  if ("id" in submitted && submitted["id"] !== undefined && submitted["id"] !== "") {
    const id = String(submitted["id"]);
    if (!RECORD_ID_RE.test(id)) {
      return {
        ok: false,
        field: "id",
        message: "Record ids are lowercase letters, digits, and dashes.",
      };
    }
    values.id = id;
  }

  if ("quote" in submitted) {
    if (typeof submitted["quote"] !== "string") {
      return { ok: false, field: "quote", message: "Expected text." };
    }
    const quote = submitted["quote"].trim();
    if (quote.length === 0) {
      return { ok: false, field: "quote", message: "The review text is required." };
    }
    if (quote.length > QUOTE_MAX) {
      return {
        ok: false,
        field: "quote",
        message: `Keep the review under ${QUOTE_MAX} characters.`,
      };
    }
    values.quote = quote;
  }

  if ("personName" in submitted) {
    if (typeof submitted["personName"] !== "string") {
      return { ok: false, field: "personName", message: "Expected text." };
    }
    const name = submitted["personName"].trim();
    if (name.length === 0) {
      return { ok: false, field: "personName", message: "The reviewer name is required." };
    }
    if (name.length > NAME_MAX) {
      return {
        ok: false,
        field: "personName",
        message: `Keep the name under ${NAME_MAX} characters.`,
      };
    }
    values.personName = cleanText(name, NAME_MAX);
  }

  if ("role" in submitted && submitted["role"] !== undefined) {
    if (typeof submitted["role"] !== "string") {
      return { ok: false, field: "role", message: "Expected text." };
    }
    const role = submitted["role"].trim();
    if (role.length > ROLE_MAX) {
      return { ok: false, field: "role", message: `Keep the role under ${ROLE_MAX} characters.` };
    }
    values.role = cleanText(role, ROLE_MAX);
  }

  if ("rating" in submitted) {
    const rating = resolveRating(submitted["rating"]);
    if (Number.isNaN(rating)) {
      return {
        ok: false,
        field: "rating",
        message: "Choose a rating between 0 and 5, or leave it empty.",
      };
    }
    values.rating = rating === null ? "" : rating;
  }

  if ("avatarUrl" in submitted && submitted["avatarUrl"] !== undefined) {
    if (typeof submitted["avatarUrl"] !== "string") {
      return { ok: false, field: "avatarUrl", message: "Expected an image address." };
    }
    const url = submitted["avatarUrl"].trim();
    if (url.length > URL_MAX || (url.length > 0 && !AVATAR_URL_RE.test(url))) {
      return {
        ok: false,
        field: "avatarUrl",
        message: "Enter an image address from this site's media library, or leave it empty.",
      };
    }
    values.avatarUrl = url;
  }

  if ("featuredAt" in submitted && submitted["featuredAt"] !== undefined) {
    if (typeof submitted["featuredAt"] !== "string") {
      return { ok: false, field: "featuredAt", message: "Expected a timestamp." };
    }
    values.featuredAt = resolveTimestamp(submitted["featuredAt"]);
  }

  if ("status" in submitted && submitted["status"] !== undefined) {
    if (
      typeof submitted["status"] !== "string" ||
      !(STATUS_VALUES as readonly string[]).includes(submitted["status"])
    ) {
      return { ok: false, field: "status", message: "Choose pending or approved." };
    }
    values.status = submitted["status"];
  }

  if ("consent" in submitted) {
    if (typeof submitted["consent"] !== "boolean") {
      return { ok: false, field: "consent", message: "Confirm the customer allowed publishing." };
    }
    values.consent = submitted["consent"];
  }

  if ("submittedAt" in submitted && submitted["submittedAt"] !== undefined) {
    values.submittedAt = resolveTimestamp(submitted["submittedAt"]);
  }

  if ("approvedAt" in submitted && submitted["approvedAt"] !== undefined) {
    values.approvedAt = resolveTimestamp(submitted["approvedAt"]);
  }

  if ("source" in submitted && submitted["source"] !== undefined) {
    if (
      typeof submitted["source"] !== "string" ||
      !(SOURCE_VALUES as readonly string[]).includes(submitted["source"])
    ) {
      return { ok: false, field: "source", message: "Expected form or manual." };
    }
    values.source = submitted["source"];
  }

  return { ok: true, values };
}

/**
 * Check one public form submission. A visitor may only ever set the quote,
 * their name, an optional role, an optional rating, and consent — the route
 * adds the id, status, and timestamps itself, so no submission can publish or
 * impersonate moderation state.
 */
export function validateSubmission(body: unknown): RecordValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "", message: "Expected a JSON object." };
  }
  const allowed: Record<string, unknown> = {};
  const submitted = body as Record<string, unknown>;
  for (const key of ["quote", "personName", "role", "rating", "consent"]) {
    if (key in submitted) allowed[key] = submitted[key];
  }
  const checked = validateRecord(allowed);
  if (!checked.ok) return checked;
  if (checked.values.consent !== true) {
    return { ok: false, field: "consent", message: "Permission to publish is required." };
  }
  return checked;
}

/** Normalize a stored row into a `TestimonialRecord`, filling safe defaults. */
export function buildRecord(raw: RawRecord): TestimonialRecord {
  const rating = resolveRating(raw.rating);
  return {
    id: typeof raw.id === "string" && RECORD_ID_RE.test(raw.id) ? raw.id : "",
    quote: typeof raw.quote === "string" ? raw.quote.trim().slice(0, QUOTE_MAX) : "",
    personName: cleanText(raw.personName, NAME_MAX),
    role: cleanText(raw.role, ROLE_MAX),
    rating: Number.isNaN(rating) ? null : rating,
    avatarUrl:
      typeof raw.avatarUrl === "string" && AVATAR_URL_RE.test(raw.avatarUrl.trim())
        ? raw.avatarUrl.trim().slice(0, URL_MAX)
        : "",
    featuredAt: resolveTimestamp(raw.featuredAt),
    status: (STATUS_VALUES as readonly string[]).includes(String(raw.status))
      ? (raw.status as TestimonialRecord["status"])
      : "pending",
    consent: raw.consent === true,
    submittedAt: resolveTimestamp(raw.submittedAt),
    approvedAt: resolveTimestamp(raw.approvedAt),
    source: (SOURCE_VALUES as readonly string[]).includes(String(raw.source))
      ? (raw.source as TestimonialRecord["source"])
      : "form",
  };
}

/**
 * Which records the site may show, in display order.
 *
 * The rules are the agreed ones: only approved records; when a minimum star
 * rating is set (1-5), unrated and lower-rated reviews are hidden; the
 * featured source shows pinned records only. Order is featured first (newest
 * pin at the top), then the rest by approval date, newest first.
 */
export function selectVisible(
  records: TestimonialRecord[],
  options: { source: "all" | "featured"; minRating: number; limit: number },
): TestimonialRecord[] {
  const min = Number.isFinite(options.minRating) ? Math.max(0, Math.min(5, options.minRating)) : 0;
  const allowed = records.filter((record) => {
    if (record.status !== "approved") return false;
    if (min >= 1 && (record.rating === null || record.rating < min)) return false;
    if (options.source === "featured" && !record.featuredAt) return false;
    return true;
  });

  const rank = (record: TestimonialRecord): number => (record.featuredAt ? 0 : 1);
  const recency = (record: TestimonialRecord): number =>
    Date.parse(record.featuredAt || record.approvedAt || record.submittedAt || "0") || 0;

  return allowed
    .sort((a, b) => rank(a) - rank(b) || recency(b) - recency(a))
    .slice(0, Math.max(1, Math.min(24, options.limit)));
}

/** Aggregate numbers for the inbox header, the activity strip, and the admin overview. */
export interface TestimonialStats {
  total: number;
  approved: number;
  pending: number;
  featured: number;
  /** Average of approved, rated reviews; null when none are rated. */
  averageRating: number | null;
  ratedCount: number;
  /** Approved this calendar month, by approval date. */
  publishedThisMonth: number;
}

/** Compute the stats from every stored record. `now` is the render moment. */
export function buildStats(records: TestimonialRecord[], now: Date): TestimonialStats {
  const approved = records.filter((record) => record.status === "approved");
  const rated = approved.filter((record) => record.rating !== null);
  const month = now.toISOString().slice(0, 7);
  const publishedThisMonth = approved.filter(
    (record) => record.approvedAt.slice(0, 7) === month,
  ).length;

  return {
    total: records.length,
    approved: approved.length,
    pending: records.filter((record) => record.status === "pending").length,
    featured: approved.filter((record) => Boolean(record.featuredAt)).length,
    averageRating:
      rated.length > 0
        ? Math.round(
            (rated.reduce((sum, record) => sum + (record.rating ?? 0), 0) / rated.length) * 10,
          ) / 10
        : null,
    ratedCount: rated.length,
    publishedThisMonth,
  };
}

/**
 * A fresh record id. Lowercase, timestamped, with enough randomness that two
 * submissions in the same millisecond cannot collide.
 */
export function makeRecordId(now: Date): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `t${now.getTime().toString(36)}${random}`;
}

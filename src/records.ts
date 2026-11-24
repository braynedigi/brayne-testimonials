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
/** The owner's public reply under a review. */
const OWNER_REPLY_MAX = 500;
/** A moderator's private note; the renderer never sees it, by contract. */
const NOTE_MAX = 300;
/** One short label a review can be tagged with, e.g. "Repairs". */
const TAG_MAX = 40;
/** Faster than a person can read the form and type; the bot check's floor. */
const BOT_MIN_MS = 2500;
const STATUS_VALUES = ["pending", "approved", "trash"] as const;
const SOURCE_VALUES = ["form", "manual"] as const;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const RECORD_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const AVATAR_URL_RE = /^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/;
const YOUTUBE_WATCH_RE =
  /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,20})/;
const YOUTUBE_SHORT_RE = /^https:\/\/youtu\.be\/([A-Za-z0-9_-]{6,20})/;
const VIMEO_RE = /^https:\/\/vimeo\.com\/([0-9]{4,12})/;
/**
 * A BCP 47 language tag as the form may carry it: language, optional
 * script/region/variants. Mirrors the host platform's own tag shape so a
 * record's locale can be compared to the page locale it renders under.
 */
const LOCALE_RE =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-[A-Za-z]{2}|\d{3})?(?:-[A-Za-z0-9]{5,8})*$/;
const LOCALE_MAX = 40;

/** One stored testimonial, already normalized for the plugin's own use. */
export interface TestimonialRecord {
  id: string;
  quote: string;
  personName: string;
  role: string;
  /** Integer 0-5, or null when the review is unrated. */
  rating: number | null;
  avatarUrl: string;
  /**
   * A photo the owner attached from this site's media library; empty shows
   * none. The public form never accepts an upload, so nothing unmoderated
   * can ever render as an image.
   */
  photoUrl: string;
  /** A YouTube or Vimeo address; the card renders a click-to-load facade. */
  videoUrl: string;
  /** One short label the owner can filter by, e.g. "Repairs". */
  tag: string;
  /**
   * The language the review was written in, as a BCP 47 tag like "en-US" or
   * "nl". Empty shows the review on every page; a locale-less page (a site
   * with no translations) also shows every review.
   */
  locale: string;
  /** ISO timestamp of the feature pin; empty means not featured. */
  featuredAt: string;
  /** Pending waits for moderation, approved renders, trash is soft-deleted. */
  status: (typeof STATUS_VALUES)[number];
  /** The owner's public reply under the review; empty renders nothing. */
  ownerReply: string;
  /** A moderator's private note. Never rendered, never exported to a page. */
  note: string;
  /** The owner's own attestation; the badge never claims more than that. */
  verified: boolean;
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
  photoUrl?: unknown;
  videoUrl?: unknown;
  tag?: unknown;
  locale?: unknown;
  featuredAt?: unknown;
  status?: unknown;
  ownerReply?: unknown;
  note?: unknown;
  verified?: unknown;
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
  const value =
    typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
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
    return {
      ok: false,
      field: "",
      message: "Expected a JSON object of testimonial fields.",
    };
  }

  const submitted = body as Record<string, unknown>;
  const values: Partial<RawRecord> = {};

  if (
    "id" in submitted &&
    submitted["id"] !== undefined &&
    submitted["id"] !== ""
  ) {
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
      return {
        ok: false,
        field: "quote",
        message: "The review text is required.",
      };
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
      return {
        ok: false,
        field: "personName",
        message: "The reviewer name is required.",
      };
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
      return {
        ok: false,
        field: "role",
        message: `Keep the role under ${ROLE_MAX} characters.`,
      };
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
      return {
        ok: false,
        field: "avatarUrl",
        message: "Expected an image address.",
      };
    }
    const url = submitted["avatarUrl"].trim();
    if (url.length > URL_MAX || (url.length > 0 && !AVATAR_URL_RE.test(url))) {
      return {
        ok: false,
        field: "avatarUrl",
        message:
          "Enter an image address from this site's media library, or leave it empty.",
      };
    }
    values.avatarUrl = url;
  }

  if ("photoUrl" in submitted && submitted["photoUrl"] !== undefined) {
    if (typeof submitted["photoUrl"] !== "string") {
      return {
        ok: false,
        field: "photoUrl",
        message: "Expected an image address.",
      };
    }
    const url = submitted["photoUrl"].trim();
    if (url.length > URL_MAX || (url.length > 0 && !AVATAR_URL_RE.test(url))) {
      return {
        ok: false,
        field: "photoUrl",
        message:
          "Enter an image address from this site's media library, or leave it empty.",
      };
    }
    values.photoUrl = url;
  }

  if ("videoUrl" in submitted && submitted["videoUrl"] !== undefined) {
    if (typeof submitted["videoUrl"] !== "string") {
      return {
        ok: false,
        field: "videoUrl",
        message: "Expected a video address.",
      };
    }
    const url = submitted["videoUrl"].trim();
    if (url.length > URL_MAX || (url.length > 0 && toEmbedUrl(url) === "")) {
      return {
        ok: false,
        field: "videoUrl",
        message: "Enter a YouTube or Vimeo address, or leave it empty.",
      };
    }
    values.videoUrl = url;
  }

  if ("tag" in submitted && submitted["tag"] !== undefined) {
    if (typeof submitted["tag"] !== "string") {
      return { ok: false, field: "tag", message: "Expected a short label." };
    }
    const tag = submitted["tag"].trim();
    if (tag.length > TAG_MAX) {
      return {
        ok: false,
        field: "tag",
        message: `Keep the tag under ${TAG_MAX} characters.`,
      };
    }
    values.tag = cleanText(tag, TAG_MAX);
  }

  if ("locale" in submitted && submitted["locale"] !== undefined) {
    if (typeof submitted["locale"] !== "string") {
      return {
        ok: false,
        field: "locale",
        message: "Expected a language tag.",
      };
    }
    const locale = normalizeLocaleTag(submitted["locale"]);
    if (submitted["locale"].trim() !== "" && locale === "") {
      return {
        ok: false,
        field: "locale",
        message: "Enter a language tag like en-US or nl, or leave it empty.",
      };
    }
    values.locale = locale;
  }

  if ("featuredAt" in submitted && submitted["featuredAt"] !== undefined) {
    if (typeof submitted["featuredAt"] !== "string") {
      return {
        ok: false,
        field: "featuredAt",
        message: "Expected a timestamp.",
      };
    }
    values.featuredAt = resolveTimestamp(submitted["featuredAt"]);
  }

  if ("status" in submitted && submitted["status"] !== undefined) {
    if (
      typeof submitted["status"] !== "string" ||
      !(STATUS_VALUES as readonly string[]).includes(submitted["status"])
    ) {
      return {
        ok: false,
        field: "status",
        message: "Choose pending, approved, or trash.",
      };
    }
    values.status = submitted["status"];
  }

  if ("ownerReply" in submitted && submitted["ownerReply"] !== undefined) {
    if (typeof submitted["ownerReply"] !== "string") {
      return { ok: false, field: "ownerReply", message: "Expected text." };
    }
    const ownerReply = submitted["ownerReply"].trim();
    if (ownerReply.length > OWNER_REPLY_MAX) {
      return {
        ok: false,
        field: "ownerReply",
        message: `Keep the reply under ${OWNER_REPLY_MAX} characters.`,
      };
    }
    values.ownerReply = cleanText(ownerReply, OWNER_REPLY_MAX);
  }

  if ("note" in submitted && submitted["note"] !== undefined) {
    if (typeof submitted["note"] !== "string") {
      return { ok: false, field: "note", message: "Expected text." };
    }
    const note = submitted["note"].trim();
    if (note.length > NOTE_MAX) {
      return {
        ok: false,
        field: "note",
        message: `Keep the note under ${NOTE_MAX} characters.`,
      };
    }
    values.note = cleanText(note, NOTE_MAX);
  }

  if ("verified" in submitted) {
    if (typeof submitted["verified"] !== "boolean") {
      return {
        ok: false,
        field: "verified",
        message: "Choose verified or not.",
      };
    }
    values.verified = submitted["verified"];
  }

  if ("consent" in submitted) {
    if (typeof submitted["consent"] !== "boolean") {
      return {
        ok: false,
        field: "consent",
        message: "Confirm the customer allowed publishing.",
      };
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
      return {
        ok: false,
        field: "source",
        message: "Expected form or manual.",
      };
    }
    values.source = submitted["source"];
  }

  return { ok: true, values };
}

/**
 * Check one public form submission. A visitor may only ever set the quote,
 * their name, an optional role, an optional rating, and consent — the route
 * adds the id, status, and timestamps itself, so no submission can publish or
 * impersonate moderation state. The quote and the name are required, exactly
 * as the form's own fields are.
 */
export function validateSubmission(body: unknown): RecordValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "", message: "Expected a JSON object." };
  }
  const submitted = body as Record<string, unknown>;
  const allowed: Record<string, unknown> = {
    quote: submitted["quote"] ?? "",
    personName: submitted["personName"] ?? "",
  };
  for (const key of ["role", "rating", "consent", "locale"]) {
    if (key in submitted) allowed[key] = submitted[key];
  }
  const checked = validateRecord(allowed);
  if (!checked.ok) return checked;
  if (checked.values.consent !== true) {
    return {
      ok: false,
      field: "consent",
      message: "Permission to publish is required.",
    };
  }
  return checked;
}

/** Normalize a stored row into a `TestimonialRecord`, filling safe defaults. */
export function buildRecord(raw: RawRecord): TestimonialRecord {
  const rating = resolveRating(raw.rating);
  return {
    id: typeof raw.id === "string" && RECORD_ID_RE.test(raw.id) ? raw.id : "",
    quote:
      typeof raw.quote === "string" ? raw.quote.trim().slice(0, QUOTE_MAX) : "",
    personName: cleanText(raw.personName, NAME_MAX),
    role: cleanText(raw.role, ROLE_MAX),
    rating: Number.isNaN(rating) ? null : rating,
    avatarUrl:
      typeof raw.avatarUrl === "string" &&
      AVATAR_URL_RE.test(raw.avatarUrl.trim())
        ? raw.avatarUrl.trim().slice(0, URL_MAX)
        : "",
    photoUrl:
      typeof raw.photoUrl === "string" &&
      AVATAR_URL_RE.test(raw.photoUrl.trim())
        ? raw.photoUrl.trim().slice(0, URL_MAX)
        : "",
    videoUrl:
      typeof raw.videoUrl === "string" && toEmbedUrl(raw.videoUrl.trim()) !== ""
        ? raw.videoUrl.trim().slice(0, URL_MAX)
        : "",
    tag: typeof raw.tag === "string" ? cleanText(raw.tag, TAG_MAX) : "",
    locale:
      typeof raw.locale === "string" ? normalizeLocaleTag(raw.locale) : "",
    featuredAt: resolveTimestamp(raw.featuredAt),
    status: (STATUS_VALUES as readonly string[]).includes(String(raw.status))
      ? (raw.status as TestimonialRecord["status"])
      : "pending",
    ownerReply:
      typeof raw.ownerReply === "string"
        ? cleanText(raw.ownerReply, OWNER_REPLY_MAX)
        : "",
    note: typeof raw.note === "string" ? cleanText(raw.note, NOTE_MAX) : "",
    verified: raw.verified === true,
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
  const min = Number.isFinite(options.minRating)
    ? Math.max(0, Math.min(5, options.minRating))
    : 0;
  const allowed = records.filter((record) => {
    if (record.status !== "approved") return false;
    if (min >= 1 && (record.rating === null || record.rating < min))
      return false;
    if (options.source === "featured" && !record.featuredAt) return false;
    return true;
  });

  const rank = (record: TestimonialRecord): number =>
    record.featuredAt ? 0 : 1;
  const recency = (record: TestimonialRecord): number =>
    Date.parse(
      record.featuredAt || record.approvedAt || record.submittedAt || "0",
    ) || 0;

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
  /**
   * How the approved, rated reviews spread across the stars: five counts,
   * index 0 is 5 stars, index 4 is 1 star. Unrated reviews are in no bar.
   */
  ratingDistribution: [number, number, number, number, number];
}

/** Compute the stats from every stored record. `now` is the render moment. */
export function buildStats(
  records: TestimonialRecord[],
  now: Date,
): TestimonialStats {
  const approved = records.filter((record) => record.status === "approved");
  const rated = approved.filter((record) => record.rating !== null);
  const month = now.toISOString().slice(0, 7);
  const publishedThisMonth = approved.filter(
    (record) => record.approvedAt.slice(0, 7) === month,
  ).length;
  const distribution: [number, number, number, number, number] = [
    0, 0, 0, 0, 0,
  ];
  for (const record of rated) {
    const stars = Math.trunc(record.rating ?? 0);
    if (stars === 5) distribution[0] += 1;
    else if (stars === 4) distribution[1] += 1;
    else if (stars === 3) distribution[2] += 1;
    else if (stars === 2) distribution[3] += 1;
    else if (stars === 1) distribution[4] += 1;
  }

  return {
    total: records.length,
    approved: approved.length,
    pending: records.filter((record) => record.status === "pending").length,
    featured: approved.filter((record) => Boolean(record.featuredAt)).length,
    averageRating:
      rated.length > 0
        ? Math.round(
            (rated.reduce((sum, record) => sum + (record.rating ?? 0), 0) /
              rated.length) *
              10,
          ) / 10
        : null,
    ratedCount: rated.length,
    publishedThisMonth,
    ratingDistribution: distribution,
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

/** A fresh invitation id, same scheme, different prefix. */
export function makeInvitationId(now: Date): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `i${now.getTime().toString(36)}${random}`;
}

/**
 * The embeddable form of a YouTube or Vimeo address, or "" when the address
 * is not one of the allowed hosts. YouTube embeds use the privacy-enhanced
 * nocookie domain; Vimeo embeds use its player domain. The facade links to
 * the original address and only ever iframes what this function approves.
 */
export function toEmbedUrl(raw: string): string {
  const url = raw.trim();
  const watch = YOUTUBE_WATCH_RE.exec(url);
  if (watch && watch[1])
    return `https://www.youtube-nocookie.com/embed/${watch[1]}`;
  const short = YOUTUBE_SHORT_RE.exec(url);
  if (short && short[1])
    return `https://www.youtube-nocookie.com/embed/${short[1]}`;
  const vimeo = VIMEO_RE.exec(url);
  if (vimeo && vimeo[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return "";
}

/**
 * Keep only the records carrying the requested tag. An empty tag matches
 * everything; the tag text is compared exactly as stored.
 */
export function withTag(
  records: TestimonialRecord[],
  tag: string,
): TestimonialRecord[] {
  const wanted = tag.trim();
  if (!wanted) return records;
  return records.filter((record) => record.tag === wanted);
}

/**
 * Canonical BCP 47 casing for a language tag the form or the editor sent:
 * lowercase language, title-cased script, upper-cased region. Anything that
 * is not a language tag answers "".
 */
export function normalizeLocaleTag(input: string): string {
  const raw = input.trim().replaceAll("_", "-");
  if (!raw) return "";
  if (raw.length > LOCALE_MAX || !LOCALE_RE.test(raw)) return "";
  const parts = raw.split("-").filter(Boolean);
  const language = parts[0]?.toLowerCase();
  if (!language) return "";
  const out = [language];
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(part))
      out.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    else if (/^[A-Za-z]{2}$/.test(part)) out.push(part.toUpperCase());
    else out.push(part.toLowerCase());
  }
  return out.join("-");
}

/**
 * The reviews a page may show. A page with no locale context (a site without
 * translations, or an untranslated page) shows every record; a localized page
 * shows records that carry no locale plus the ones whose language matches the
 * page's. The match is by primary language subtag, so a review tagged "nl"
 * shows on an "nl-NL" page - the words are Dutch, wherever the visitor is.
 */
export function selectByLocale(
  records: TestimonialRecord[],
  pageLocale: string,
): TestimonialRecord[] {
  const page = normalizeLocaleTag(pageLocale);
  if (!page) return records;
  const language = page.split("-")[0]?.toLowerCase() ?? "";
  return records.filter((record) => {
    const tag = record.locale;
    if (!tag) return true;
    return (
      (normalizeLocaleTag(tag).split("-")[0]?.toLowerCase() ?? "") === language
    );
  });
}

const INVITE_NAME_MAX = 80;
const INVITE_NOTE_MAX = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One sent invitation, as the admin panel lists it. */
export interface Invitation {
  id: string;
  name: string;
  email: string;
  note: string;
  sentAt: string;
}

export type InvitationValidation =
  | { ok: true; values: { name: string; email: string; note: string } }
  | { ok: false; field: string; message: string };

/**
 * Check one invitation the admin composed. The email is required and must
 * look like one; the name and note are optional, bounded, and cleaned the
 * same way every stored string is.
 */
export function validateInvitation(body: unknown): InvitationValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "", message: "Expected a JSON object." };
  }
  const submitted = body as Record<string, unknown>;
  const email =
    typeof submitted["email"] === "string" ? submitted["email"].trim() : "";
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    return {
      ok: false,
      field: "email",
      message: "Enter a valid email address.",
    };
  }
  if ("name" in submitted && typeof submitted["name"] !== "string") {
    return { ok: false, field: "name", message: "Expected text." };
  }
  if ("note" in submitted && typeof submitted["note"] !== "string") {
    return { ok: false, field: "note", message: "Expected text." };
  }
  /** Bounds are judged before cleaning, which would otherwise truncate. */
  const rawName =
    typeof submitted["name"] === "string" ? submitted["name"].trim() : "";
  const rawNote =
    typeof submitted["note"] === "string" ? submitted["note"].trim() : "";
  if (rawName.length > INVITE_NAME_MAX) {
    return {
      ok: false,
      field: "name",
      message: `Keep the name under ${INVITE_NAME_MAX} characters.`,
    };
  }
  if (rawNote.length > INVITE_NOTE_MAX) {
    return {
      ok: false,
      field: "note",
      message: `Keep the note under ${INVITE_NOTE_MAX} characters.`,
    };
  }
  return {
    ok: true,
    values: {
      name: cleanText(rawName, INVITE_NAME_MAX),
      email,
      note: cleanText(rawNote, INVITE_NOTE_MAX),
    },
  };
}

/** The most rows one import request may carry. */
export const IMPORT_MAX_ROWS = 200;

export type ImportRowResult =
  | { ok: true; record: RawRecord }
  | { ok: false; field: string; message: string };

/**
 * Turn one imported row into a pending record. The row travels through the
 * same validation a public submission does, so an import can never smuggle
 * moderation state: whatever the row claims, the record arrives pending,
 * unfeatured, unverified, with the owner's consent attestation.
 */
export function importRow(raw: unknown, now: Date): ImportRowResult {
  const checked = validateSubmission(raw);
  if (!checked.ok)
    return { ok: false, field: checked.field, message: checked.message };
  const values = checked.values;
  return {
    ok: true,
    record: {
      id: makeRecordId(now),
      quote: typeof values.quote === "string" ? values.quote : "",
      personName:
        typeof values.personName === "string" ? values.personName : "",
      role: typeof values.role === "string" ? values.role : "",
      rating: "rating" in values ? values.rating : null,
      avatarUrl: "",
      photoUrl: "",
      videoUrl: "",
      tag: "",
      locale: typeof values.locale === "string" ? values.locale : "",
      featuredAt: "",
      status: "pending",
      ownerReply: "",
      note: "",
      verified: false,
      consent: true,
      submittedAt: now.toISOString(),
      approvedAt: "",
      source: "manual",
    },
  };
}

/** The export's columns, in order; the note is the owner's, so it travels. */
const CSV_COLUMNS = [
  "id",
  "quote",
  "personName",
  "role",
  "rating",
  "status",
  "featuredAt",
  "ownerReply",
  "note",
  "verified",
  "consent",
  "submittedAt",
  "approvedAt",
  "source",
  "photoUrl",
  "videoUrl",
  "tag",
  "locale",
] as const;

/** One CSV cell, RFC 4180: quotes doubled, always quoted when it matters. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Every stored record as CSV for the owner to download. Trashed records
 * keep their status column, so the export describes the moderation state
 * rather than hiding it.
 */
export function toCsv(records: TestimonialRecord[]): string {
  const rows: string[] = [CSV_COLUMNS.join(",")];
  for (const record of records) {
    const cells = CSV_COLUMNS.map((column) => {
      const value = record[column];
      return csvCell(
        value === null || value === undefined ? "" : String(value),
      );
    });
    rows.push(cells.join(","));
  }
  return rows.join("\r\n");
}

/**
 * The submission-time bot check, for sites with no CAPTCHA provider.
 * A filled honeypot field, or a form "completed" faster than a person can
 * read it, is silently dropped: the caller answers success either way, so
 * the bot learns nothing. A submission without the timing field (scripting
 * off, or an honest integration) is only judged by the honeypot.
 */
export function isLikelyBot(body: unknown, now: number): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const submitted = body as Record<string, unknown>;
  if (
    typeof submitted["company"] === "string" &&
    submitted["company"].trim() !== ""
  ) {
    return true;
  }
  const started = Number(submitted["jbt-start"]);
  if (!Number.isFinite(started) || started <= 0) return false;
  const elapsed = now - started;
  return elapsed >= 0 && elapsed < BOT_MIN_MS;
}

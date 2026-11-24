import type {
  PluginContext,
  PluginHttpRequest,
  PluginModule,
} from "@justflows/sdk";
import {
  API_NAMESPACE,
  PLUGIN_ID,
  SETTING_KEYS,
  buildSettings,
  validateSettingsUpdate,
} from "./settings.js";
import {
  buildRecord,
  buildStats,
  IMPORT_MAX_ROWS,
  importRow,
  isLikelyBot,
  makeInvitationId,
  makeRecordId,
  selectByLocale,
  selectVisible,
  toCsv,
  validateInvitation,
  validateRecord,
  validateSubmission,
  withTag,
  type ImportRowResult,
  type RawRecord,
  type TestimonialRecord,
} from "./records.js";
import {
  REVIEW_FORM_BLOCK,
  STRIP_BLOCK,
  TESTIMONIALS_BLOCK,
  reviewFormBlock,
  testimonialStripBlock,
  testimonialsBlock,
} from "./blocks.js";
import { testimonialPatterns } from "./patterns.js";

/** The `ctx.data` collection every testimonial row lives in. */
const COLLECTION = "records";

/** The `ctx.data` collection every sent invitation lives in. */
const INVITATIONS = "invitations";

/** Every moderation action the inbox offers. */
const MODERATION_ACTIONS = [
  "approve",
  "unapprove",
  "feature",
  "unfeature",
  "trash",
  "restore",
  "verify",
  "unverify",
  "delete",
] as const;

/** Raw `settingsSchema` values as the routes read them. */
type RawSettings = Record<string, unknown>;

/** Is this request coming from an administrator of this site? */
function requireAdministrator(req: PluginHttpRequest) {
  if (req.session?.role === "administrator") return null;
  return {
    status: 403,
    body: { error: "Administrator access required" },
    headers: { "Cache-Control": "no-store" },
  };
}

/** Read every settings key in one pass, then apply defaults. */
async function readSettings(ctx: PluginContext) {
  const values = await Promise.all(
    SETTING_KEYS.map((key) => ctx.settings.get(key)),
  );
  const raw: RawSettings = {};
  SETTING_KEYS.forEach((key, index) => {
    raw[key] = values[index];
  });
  return buildSettings(raw);
}

/** Every stored record, normalized, newest submissions first. */
async function readRecords(ctx: PluginContext): Promise<TestimonialRecord[]> {
  const rows = await ctx.data.list<RawRecord>(COLLECTION);
  return rows
    .map((row) => buildRecord({ ...row.data, id: row.id }))
    .sort(
      (a, b) =>
        Date.parse(b.submittedAt || "0") - Date.parse(a.submittedAt || "0"),
    );
}

/**
 * The payload every admin route answers with: the settings view, every
 * record with its moderation state, the aggregate stats, the sent
 * invitations, and whether the site has a CAPTCHA provider the form can use.
 */
async function adminPayload(ctx: PluginContext) {
  const [settings, records, invitationRows] = await Promise.all([
    readSettings(ctx),
    readRecords(ctx),
    ctx.data.list<{
      name?: unknown;
      email?: unknown;
      note?: unknown;
      sentAt?: unknown;
    }>(INVITATIONS),
  ]);
  let captcha: { provider: string | null } = { provider: null };
  try {
    /** Older hosts may not expose the CAPTCHA api; that reads as "none". */
    const config = ctx.captcha ? await ctx.captcha.config() : null;
    captcha = { provider: config ? config.provider : null };
  } catch {
    /** An unavailable CAPTCHA api reads as "no provider": moderation holds. */
  }
  const invitations = invitationRows
    .map((row) => ({
      id: row.id,
      name: typeof row.data?.name === "string" ? row.data.name : "",
      email: typeof row.data?.email === "string" ? row.data.email : "",
      note: typeof row.data?.note === "string" ? row.data.note : "",
      sentAt: typeof row.data?.sentAt === "string" ? row.data.sentAt : "",
    }))
    .sort((a, b) => Date.parse(b.sentAt || "0") - Date.parse(a.sentAt || "0"));
  return {
    body: {
      settings,
      records,
      stats: buildStats(records, new Date()),
      captcha,
      invitations,
    },
    headers: { "Cache-Control": "no-store" },
  };
}

/**
 * `GET /api/brayne-testimonials/admin-data` — the admin app's inbox in one
 * request. Administrator-only, like the WhatsApp Connect admin routes.
 */
async function handleAdminData(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;
  return adminPayload(ctx);
}

/**
 * `PUT /api/brayne-testimonials/admin-settings` — the admin app's settings
 * save. Validates every value, writes only the sent keys, and answers with
 * the fresh payload so the screen re-renders from one source.
 */
async function handleAdminSettings(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;
  const checked = validateSettingsUpdate(req.body);
  if (!checked.ok) {
    return {
      status: 400,
      body: { error: checked.message, field: checked.field },
    };
  }
  for (const [key, value] of Object.entries(checked.values)) {
    await ctx.settings.set(key, value);
  }
  /** Display settings change what public pages render, so caches drop. */
  const fresh = await adminPayload(ctx);
  return { ...fresh, revalidate: true };
}

/**
 * `PUT /api/brayne-testimonials/record` — the admin app's editor save.
 * Creates or updates one record. Approval is stamped when a record first
 * becomes approved, and cleared again if it returns to pending, so the
 * "published this month" count and the date display stay truthful.
 */
async function handleRecordSave(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;
  const checked = validateRecord(req.body);
  if (!checked.ok) {
    return {
      status: 400,
      body: { error: checked.message, field: checked.field },
    };
  }
  if (checked.values.consent === false) {
    return {
      status: 400,
      body: {
        error: "Confirm the customer allowed publishing.",
        field: "consent",
      },
    };
  }

  const now = new Date();
  const id =
    typeof checked.values.id === "string" && checked.values.id
      ? checked.values.id
      : makeRecordId(now);
  const existing = await ctx.data.get<RawRecord>(COLLECTION, id);
  const current = buildRecord(existing ? { ...existing.data, id } : { id });

  const next: RawRecord = {
    id,
    quote:
      typeof checked.values.quote === "string"
        ? checked.values.quote
        : current.quote,
    personName:
      typeof checked.values.personName === "string"
        ? checked.values.personName
        : current.personName,
    role:
      typeof checked.values.role === "string"
        ? checked.values.role
        : current.role,
    rating: "rating" in checked.values ? checked.values.rating : current.rating,
    avatarUrl:
      typeof checked.values.avatarUrl === "string"
        ? checked.values.avatarUrl
        : current.avatarUrl,
    photoUrl:
      typeof checked.values.photoUrl === "string"
        ? checked.values.photoUrl
        : current.photoUrl,
    videoUrl:
      typeof checked.values.videoUrl === "string"
        ? checked.values.videoUrl
        : current.videoUrl,
    tag:
      typeof checked.values.tag === "string" ? checked.values.tag : current.tag,
    locale:
      typeof checked.values.locale === "string"
        ? checked.values.locale
        : current.locale,
    featuredAt:
      typeof checked.values.featuredAt === "string"
        ? checked.values.featuredAt
        : current.featuredAt,
    status:
      typeof checked.values.status === "string"
        ? checked.values.status
        : current.status,
    ownerReply:
      typeof checked.values.ownerReply === "string"
        ? checked.values.ownerReply
        : current.ownerReply,
    note:
      typeof checked.values.note === "string"
        ? checked.values.note
        : current.note,
    verified:
      typeof checked.values.verified === "boolean"
        ? checked.values.verified
        : current.verified,
    consent: checked.values.consent === true ? true : current.consent,
    submittedAt: current.submittedAt || now.toISOString(),
    approvedAt:
      typeof checked.values.approvedAt === "string"
        ? checked.values.approvedAt
        : current.approvedAt,
    source:
      typeof checked.values.source === "string"
        ? checked.values.source
        : current.source,
  };

  if (next.status === "approved" && !next.approvedAt)
    next.approvedAt = now.toISOString();
  if (next.status === "pending" || next.status === "trash")
    next.approvedAt = "";

  await ctx.data.put(COLLECTION, id, next);
  const fresh = await adminPayload(ctx);
  return { ...fresh, revalidate: true };
}

/**
 * `POST /api/brayne-testimonials/moderate` — the inbox's one-click actions.
 * Approving stamps the approval time; featuring pins with the current
 * moment, so the newest pin always sorts first, exactly as agreed.
 */
async function handleModerate(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const id = typeof body["id"] === "string" ? body["id"] : "";
  const action = typeof body["action"] === "string" ? body["action"] : "";
  if (!id || !(MODERATION_ACTIONS as readonly string[]).includes(action)) {
    return {
      status: 400,
      body: { error: "Expected a record id and a known action." },
    };
  }

  const existing = await ctx.data.get<RawRecord>(COLLECTION, id);
  if (!existing) {
    return { status: 404, body: { error: "Record not found" } };
  }
  const record = buildRecord({ ...existing.data, id });

  if (action === "delete") {
    await ctx.data.delete(COLLECTION, id);
  } else {
    const now = new Date();
    if (action === "approve") {
      record.status = "approved";
      record.approvedAt = record.approvedAt || now.toISOString();
    }
    if (action === "unapprove" || action === "restore") {
      /** Restore brings a trashed review back to the moderation queue. */
      record.status = "pending";
      record.approvedAt = "";
    }
    if (action === "trash") {
      /**
       * Soft delete: the record stays in the data store for a change of
       * heart, but "approved" it is not, so no public page renders it.
       */
      record.status = "trash";
      record.approvedAt = "";
    }
    if (action === "feature") record.featuredAt = now.toISOString();
    if (action === "unfeature") record.featuredAt = "";
    /** Verification is the owner's own attestation; nothing more is claimed. */
    if (action === "verify") record.verified = true;
    if (action === "unverify") record.verified = false;
    await ctx.data.put(COLLECTION, id, record);
  }

  const fresh = await adminPayload(ctx);
  return { ...fresh, revalidate: true };
}

/**
 * `GET /api/brayne-testimonials/export` — every stored record as CSV for the
 * owner to download. Administrator-only, like the other admin routes. The
 * note travels too: it is the owner's own data, and the export is the one
 * place a moderator's private record-keeping belongs.
 */
async function handleExport(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;
  const records = await readRecords(ctx);
  return {
    body: toCsv(records),
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="brayne-testimonials.csv"',
      "Cache-Control": "no-store",
    },
  };
}

/**
 * `POST /api/brayne-testimonials/invite` — send one customer a personalized
 * invitation to the review form. Administrator-only, CSRF-enforced by the
 * host. On-demand only: the plugin has no scheduler and pretends to none.
 */
async function handleInvite(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;

  const checked = validateInvitation(req.body);
  if (!checked.ok) {
    return {
      status: 400,
      body: { error: checked.message, field: checked.field },
    };
  }

  const settings = await readSettings(ctx);
  if (!settings.collectionUrl) {
    return {
      status: 400,
      body: {
        error:
          "Set the reviews page address first, so the invitation has a link to carry.",
        field: "collectionUrl",
      },
    };
  }

  /** The invitee's name rides the link, so the form arrives pre-filled. */
  const link = `${settings.collectionUrl}${
    checked.values.name
      ? `?name=${encodeURIComponent(checked.values.name)}`
      : ""
  }`;
  const text = [
    checked.values.name ? `Hello ${checked.values.name},` : "Hello,",
    "",
    "We would love to hear how your experience went. It takes a minute:",
    link,
    "",
    "Every review is read by a real person before it appears on the site.",
    ...(checked.values.note ? ["", checked.values.note] : []),
  ].join("\n");

  try {
    await ctx.mail.send({
      to: checked.values.email,
      subject: "How did we do?",
      text,
    });
  } catch {
    return {
      status: 400,
      body: { error: "The email could not be sent; nothing was recorded." },
    };
  }

  const now = new Date();
  await ctx.data.put(INVITATIONS, makeInvitationId(now), {
    name: checked.values.name,
    email: checked.values.email,
    note: checked.values.note,
    sentAt: now.toISOString(),
  });

  const fresh = await adminPayload(ctx);
  return fresh;
}

/**
 * `POST /api/brayne-testimonials/import` — import reviews from a CSV the
 * admin pasted in. Administrator-only, CSRF-enforced. Every row travels
 * through the same validation a public submission does and lands pending,
 * whatever moderation state the file claims; each failed row is reported
 * without stopping the rest.
 */
async function handleImport(ctx: PluginContext, req: PluginHttpRequest) {
  const denied = requireAdministrator(req);
  if (denied) return denied;

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const rows = Array.isArray(body["rows"]) ? body["rows"] : [];
  if (rows.length === 0 || rows.length > IMPORT_MAX_ROWS) {
    return {
      status: 400,
      body: { error: `Send 1 to ${IMPORT_MAX_ROWS} rows at a time.` },
    };
  }

  const now = new Date();
  const failed: Array<{ row: number; field: string; message: string }> = [];
  let imported = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const result: ImportRowResult = importRow(rows[index], now);
    if (!result.ok) {
      failed.push({
        row: index + 1,
        field: result.field,
        message: result.message,
      });
      continue;
    }
    await ctx.data.put(COLLECTION, String(result.record.id), result.record);
    imported += 1;
  }

  return { body: { imported, failed } };
}

/**
 * `GET /api/brayne-testimonials/form-config` — what the review form needs to
 * arm the site's own CAPTCHA: the provider's public widget details, or null
 * when the site has none configured. `no-store` and CORS-enabled so a
 * statically exported page can read it, like the WhatsApp widget's config.
 */
async function handleFormConfig(ctx: PluginContext) {
  const settings = await readSettings(ctx);
  let captcha = null;
  try {
    /** Older hosts may not expose the CAPTCHA api; the form then says so. */
    const config = ctx.captcha ? await ctx.captcha.config() : null;
    if (config) {
      captcha = {
        provider: config.provider,
        siteKey: config.siteKey,
        scriptSrc: config.scriptSrc,
        widgetClass: config.widgetClass,
        field: config.field,
      };
    }
  } catch {
    /** No provider configured: the form says so and relies on moderation. */
  }
  return {
    body: { captcha, requireCaptcha: settings.requireCaptcha },
    headers: { "Cache-Control": "no-store" },
    /** A statically exported page runs on another origin and reads this. */
    cors: true,
  };
}

/**
 * `POST /api/brayne-testimonials/submit` — the public review form.
 *
 * `csrf: false` because the caller is an anonymous visitor with no session
 * token to present; in exchange the route refuses any request whose `Origin`
 * is not this site, honours the site's CAPTCHA when one is configured, and is
 * rate-limited. Everything arrives as pending: no submission can publish
 * itself, whatever it claims to carry.
 */
async function handleSubmit(ctx: PluginContext, req: PluginHttpRequest) {
  if (req.trustedOrigin === false) {
    return {
      status: 403,
      body: { error: "Cross-origin request refused" },
      cors: true,
    };
  }

  /**
   * The honeypot-and-timing gate, always on. A caught bot is answered with
   * the exact success shape a real submission gets, so it learns nothing and
   * nobody retries harder; nothing is stored.
   */
  if (isLikelyBot(req.body, Date.now())) {
    return { status: 200, body: { ok: true }, cors: true };
  }

  const settings = await readSettings(ctx);
  if (settings.requireCaptcha && ctx.captcha) {
    const config = await ctx.captcha.config().catch(() => null);
    if (config) {
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const token =
        typeof body["captchaToken"] === "string" ? body["captchaToken"] : "";
      if (!token) {
        return {
          status: 400,
          body: { error: "Complete the CAPTCHA first." },
          cors: true,
        };
      }
      const verified = await ctx.captcha.verify(token).catch(() => false);
      if (!verified) {
        return {
          status: 400,
          body: { error: "CAPTCHA verification failed. Try again." },
          cors: true,
        };
      }
    }
  }

  const checked = validateSubmission(req.body);
  if (!checked.ok) {
    return {
      status: 400,
      body: { error: checked.message, field: checked.field },
      cors: true,
    };
  }

  const now = new Date();
  const record: RawRecord = {
    id: makeRecordId(now),
    quote: typeof checked.values.quote === "string" ? checked.values.quote : "",
    personName:
      typeof checked.values.personName === "string"
        ? checked.values.personName
        : "",
    role: typeof checked.values.role === "string" ? checked.values.role : "",
    rating: "rating" in checked.values ? checked.values.rating : null,
    avatarUrl: "",
    featuredAt: "",
    status: "pending",
    consent: true,
    submittedAt: now.toISOString(),
    approvedAt: "",
    source: "form",
    locale:
      typeof checked.values.locale === "string" ? checked.values.locale : "",
  };
  await ctx.data.put(COLLECTION, String(record.id), record);

  /**
   * The notification is a courtesy, never a gate: a transport failure must
   * not tell a customer their review failed.
   */
  if (settings.notifyEmail) {
    try {
      await ctx.mail.send({
        to: settings.notifyEmail,
        subject: "New review awaiting approval",
        text: `${record.personName} left a review:\n\n${record.quote}\n\nApprove or reject it in the Testimonials admin.`,
      });
    } catch {
      ctx.logger.warn("Testimonial notification email failed to send");
    }
  }

  return { status: 200, body: { ok: true }, cors: true };
}

/**
 * The `content.blocks` pass: immediately before a page renders, hydrate this
 * plugin's blocks with live data. One settings read and one records read
 * serve every block on the page, and any failure leaves the stored tree
 * untouched — a data problem renders an empty block, never a broken page.
 */
function hydrateBlocks(ctx: PluginContext) {
  return async (blocks: unknown, context?: unknown): Promise<unknown> => {
    try {
      /** Mutate the tree's own nodes, not copies of them. */
      const found: BlockNode[] = [];
      collect(blocks, found);
      ctx.logger.info("Testimonials content.blocks hydration", {
        isBlockArray: Array.isArray(blocks),
        foundCount: found.length,
        foundTypes: found.map((n) => String(n.type)),
      });
      if (found.length === 0) return blocks;

      /** The page's locale when the host renders a translated page; absent on unlocalized sites. */
      const pageLocale =
        context && typeof context === "object" && !Array.isArray(context)
          ? typeof (context as Record<string, unknown>)["locale"] === "string"
            ? ((context as Record<string, unknown>)["locale"] as string)
            : ""
          : "";

      const [settings, rows] = await Promise.all([
        readSettings(ctx),
        ctx.data.list<RawRecord>(COLLECTION),
      ]);
      const records = rows.map((row) =>
        buildRecord({ ...row.data, id: row.id }),
      );
      ctx.logger.info("Testimonials hydration data read", {
        recordCount: records.length,
        approvedCount: records.filter((r) => r.status === "approved").length,
        minRating: settings.minRatingToDisplay,
        pageLocale: pageLocale || null,
      });

      for (const node of found) {
        const props = node.props as Record<string, unknown>;
        if (node.type === TESTIMONIALS_BLOCK) {
          const limit = typeof props["limit"] === "number" ? props["limit"] : 6;
          const source = props["source"] === "featured" ? "featured" : "all";
          const tag = typeof props["tag"] === "string" ? props["tag"] : "";
          props["records"] = withTag(
            selectVisible(selectByLocale(records, pageLocale), {
              source,
              minRating: settings.minRatingToDisplay,
              limit,
            }),
            tag,
          ).map(toDisplayRecord);
        }
        if (node.type === STRIP_BLOCK) {
          props["stats"] = buildStats(records, new Date());
        }
      }
      return blocks;
    } catch {
      return blocks;
    }
  };
}

/** One stored block node as the hydration pass sees it. */
interface BlockNode {
  id?: unknown;
  type: unknown;
  version: unknown;
  props: unknown;
  children?: unknown;
}

/** Collect this plugin's blocks from a page's stored block tree, in place. */
function collect(value: unknown, found: BlockNode[]): BlockNode[] {
  if (!Array.isArray(value)) return found;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as BlockNode;
    if (node.type === TESTIMONIALS_BLOCK || node.type === STRIP_BLOCK) {
      if (
        !node.props ||
        typeof node.props !== "object" ||
        Array.isArray(node.props)
      ) {
        node.props = {};
      }
      found.push(node);
    }
    if (Array.isArray(node.children)) collect(node.children, found);
  }
  return found;
}

/** The subset of a record the renderer needs, as plain JSON. */
function toDisplayRecord(record: TestimonialRecord) {
  return {
    id: record.id,
    quote: record.quote,
    personName: record.personName,
    role: record.role,
    rating: record.rating,
    avatarUrl: record.avatarUrl,
    photoUrl: record.photoUrl,
    videoUrl: record.videoUrl,
    ownerReply: record.ownerReply,
    verified: record.verified,
    approvedAt: record.approvedAt,
  };
}

const brayneTestimonials: PluginModule = {
  manifest: {
    id: PLUGIN_ID,
    apiNamespace: API_NAMESPACE,
    name: "Brayne Testimonials",
    version: "0.6.0",
    description:
      "Collect customer reviews through a moderated form and display them as testimonial blocks: grid, slider, or feature quote, with optional star ratings, avatars, and an honest activity strip.",
    author: "Brayne Smart solutions Corp",
    homepage: "https://braynesmartsolutions.com",
    license: "GPL-2.0-or-later",
    engines: { justflows: ">=0.4.0 <0.5.0" },
    permissions: ["admin:extend", "mail:send"],
    main: "index.js",
    registry: {
      commercialMarketplace: false,
      listed: false,
      free: true,
      comingSoon: true,
    },
    adminSection: {
      label: "Testimonials",
      icon: "\u2605",
    },
    adminMenu: [
      {
        id: "testimonials",
        label: "Testimonials",
        path: "",
        icon: "\u2605",
        domain: "plugin",
        listed: true,
      },
    ],
    adminApp: {
      dir: "admin",
      routes: [{ path: "", entry: "index.html", title: "Testimonials" }],
      locales: { en: "locales/en.json" },
    },
    settingsSchema: {
      notifyEmail: {
        type: "string",
        label: "Notification email",
        description:
          "Where new submissions are announced. Empty sends no email.",
        default: "",
      },
      requireCaptcha: {
        type: "boolean",
        label: "Require CAPTCHA",
        description:
          "Uses the site's own configured CAPTCHA provider (Turnstile, hCaptcha, or reCAPTCHA). With no provider configured, submissions rely on moderation.",
        default: true,
      },
      minRatingToDisplay: {
        type: "select",
        label: "Minimum star rating",
        description:
          "0 shows everything. When a minimum is set, unrated reviews are hidden from the site but stay visible in the inbox.",
        default: "0",
        options: [
          { value: "0", label: "No minimum" },
          { value: "1", label: "1 star and above" },
          { value: "2", label: "2 stars and above" },
          { value: "3", label: "3 stars and above" },
          { value: "4", label: "4 stars and above" },
          { value: "5", label: "5 stars only" },
        ],
      },
      collectionUrl: {
        type: "string",
        label: "Reviews page address",
        description:
          "The page that holds the Review form block, so the admin can copy a shareable link.",
        default: "",
      },
    },
    assets: {
      dir: "public",
      blocks: {
        [TESTIMONIALS_BLOCK]: {
          scripts: ["testimonials.js"],
          styles: ["testimonials.css"],
        },
        [REVIEW_FORM_BLOCK]: {
          scripts: ["review-form.js"],
          styles: ["review-form.css"],
        },
        [STRIP_BLOCK]: { styles: ["testimonials.css"] },
      },
    },
  },

  async activate(ctx: PluginContext) {
    ctx.logger.info("Brayne Testimonials activating");

    ctx.http.get("admin-data", (req) => handleAdminData(ctx, req));
    ctx.http.put("admin-settings", (req) => handleAdminSettings(ctx, req));
    ctx.http.put("record", (req) => handleRecordSave(ctx, req));
    ctx.http.post("moderate", (req) => handleModerate(ctx, req));
    ctx.http.get("export", (req) => handleExport(ctx, req));
    ctx.http.post("invite", (req) => handleInvite(ctx, req));
    ctx.http.post("import", (req) => handleImport(ctx, req));
    ctx.http.get("form-config", () => handleFormConfig(ctx));
    ctx.http.post("submit", (req) => handleSubmit(ctx, req), {
      csrf: false,
      rateLimit: { limit: 30, windowMs: 60_000, key: "submit" },
    });

    /**
     * Layout and columns live with each placed block, chosen in the page
     * builder; the definition's static defaults are what a new insert starts
     * from. No settings read happens here, so activation cannot fail on one.
     */
    ctx.blocks.register(testimonialsBlock());
    ctx.blocks.register(reviewFormBlock());
    ctx.blocks.register(testimonialStripBlock());
    for (const pattern of testimonialPatterns()) {
      ctx.patterns.register(pattern);
    }

    ctx.hooks.filter("content.blocks", hydrateBlocks(ctx));

    ctx.logger.info("Brayne Testimonials activated");
  },

  async deactivate(ctx: PluginContext) {
    /**
     * Routes, blocks, patterns, and hook registrations are owned by the host
     * and dropped automatically. Stored records stay put so deactivating and
     * reactivating never erases reviews; `deleteData` is what clears them.
     */
    ctx.logger.info("Brayne Testimonials deactivated");
  },

  async deleteData(ctx: PluginContext) {
    for (const collection of [COLLECTION, INVITATIONS]) {
      const rows = await ctx.data.list<RawRecord>(collection);
      for (const row of rows) {
        await ctx.data.delete(collection, row.id);
      }
    }
    ctx.logger.info(
      "Brayne Testimonials deleteData (records and invitations cleared)",
    );
  },
};

export default brayneTestimonials;

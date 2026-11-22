# Brayne Testimonials

Collect customer reviews through a moderated form and show them as testimonial
blocks on JustFlows pages: a grid, a slider, or one feature quote, with
optional star ratings, avatars, and an honest activity strip.

Built against JustFlows `>=0.4.0 <0.5.0` with `@justflows/sdk` v0.1.9.

## What it does

- **Review form block** for any page: rating, review text, name, and role,
  armed with the site's own configured CAPTCHA (Turnstile, hCaptcha, or
  reCAPTCHA). Every submission arrives as **pending** — nothing publishes
  itself, whatever the request claims to carry.
- **Testimonials block** in three layouts (grid, slider, feature quote) and
  three styles (cards, minimal, quote marks), with per-block toggles for
  stars, avatars, role/company, and dates.
- **Moderation inbox** in the plugin's own admin screen: filter tabs for
  pending, approved, featured, and everything, stat tiles, one-click approve,
  unapprove, feature, unfeature, and delete, and a full record editor with a
  star picker and per-field validation messages.
- **Honest activity strip** block: reviews published this month and the
  average rating of approved, rated reviews. With nothing approved, the strip
  renders nothing at all — no invented numbers.
- **Collection link panel**: the admin stores the page address that holds the
  Review form block and can copy a shareable link from the settings screen.

## Privacy and moderation posture

This is the part worth reading before you install anything.

- **Moderation is the gate.** Only approved records ever render on the site,
  and approval is stamped server-side when a record first becomes approved.
- **A visitor sets five fields, not fifty.** The public submit route accepts
  only quote, name, role, rating, and consent through `validateSubmission`;
  the id, status, and timestamps are the server's.
- **CAPTCHA when the site has one.** The form reads the site's configured
  provider through the plugin context and verifies the token on the server.
  With no provider configured, the form says so honestly and relies on
  moderation.
- **The submit route is rate-limited** and refuses any request whose `Origin`
  is not this site.
- **Consent is required.** A review cannot be submitted without the
  submitter confirming the words may be shown on this site.
- **Unrated reviews can be hidden** from the site (a per-setting minimum star
  rating) while staying visible in the inbox.

## Blocks

| Block            | Type                                   | Renders                                                             |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Testimonials     | `justflows.brayne-testimonials.reviews` | Approved reviews in a grid, slider, or one feature quote             |
| Review form      | `justflows.brayne-testimonials.form`    | The public collection form, using the site's CAPTCHA                 |
| Review activity  | `justflows.brayne-testimonials.strip`   | Published this month and the average rating; empty when there is none |

Three builder patterns (testimonial wall, hero quote, footer quote) reference
these block types, so a new page can start from a composed layout.

The reviews and the strip's stats are **render-time props**: the plugin's
`content.blocks` pass injects them into the stored tree immediately before the
page renders, so pages carry the reviews in their HTML. The builder never
sends them, so a page save stores none of it; the builder instead shows
`preview.sampleProps`, which are never saved.

## Settings

| Setting             | Default    | Notes                                                                                          |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| Notification email  | _(empty)_  | Where new submissions are announced. Empty sends no email. A send failure is logged, never surfaced to the visitor as a failed review. |
| Require CAPTCHA     | on         | Uses the site's own configured provider. With none configured, submissions rely on moderation.  |
| Minimum star rating | no minimum | When set, unrated and lower-rated reviews are hidden from the site but stay visible in the inbox.|
| Reviews page address| _(empty)_  | The page that holds the Review form block, so the admin can copy a shareable link.              |

The plugin's settings screen also offers **Apply layout**: pick Grid, Slider,
or Feature quote and the app edits every placed Testimonials block through
the content API and publishes the pages it touched — one click changes the
site, and because the choice is written onto the blocks themselves, the page
builder's inspector stays truthful. Stars, avatars, dates, columns, style,
and per-block layout remain per-block choices in the page builder.

## How it is wired

```
brayne-testimonials/
  justflows.json                    manifest: id, settings, admin nav, admin app, assets
  src/index.ts                      PluginModule: routes + content.blocks hydration + lifecycle
  src/settings.ts                   pure settings normalisation and bounds
  src/records.ts                    record model, validation, display selection, stats
  src/render.ts                     pure HTML renderer for the three blocks
  src/blocks.ts                     the three block definitions (schema, actions, previews)
  src/patterns.ts                   the three builder patterns
  admin/index.html                  the plugin's admin app (no build step)
  admin/app.js                      inbox, editor, settings, collect panels
  admin/app.css                     admin-app styles, light + dark
  admin/locales/en.json             admin catalog (required by the SDK)
  public/testimonials.js            slider arrows + dots (plain JS, no build)
  public/testimonials.css           block styles
  public/review-form.js             form behaviour + CAPTCHA wiring
  public/review-form.css            form styles
  dist/                             tsc output (entry: dist/index.js)
  tests/unit/                       vitest suites
```

**Endpoints** (namespace `brayne-testimonials`):

- `GET /api/brayne-testimonials/admin-data` — administrator-only payload for
  the plugin's admin app: settings with defaults applied, every record with
  its moderation state, the aggregate stats, and whether the site has a
  CAPTCHA provider.
- `PUT /api/brayne-testimonials/admin-settings` — administrator-only save
  (CSRF enforced by the host); validates every value, writes only the sent
  keys, and answers with the fresh payload.
- `PUT /api/brayne-testimonials/record` — administrator-only editor save.
  Creates or updates one record; approval is stamped when a record first
  becomes approved and cleared again if it returns to pending.
- `POST /api/brayne-testimonials/moderate` — administrator-only one-click
  actions: approve, unapprove, feature (pins with the current moment, so the
  newest pin sorts first), unfeature, delete.
- `GET /api/brayne-testimonials/form-config` — the CAPTCHA provider's public
  widget details for the form, `no-store`, CORS-enabled so a statically
  exported page can read it.
- `POST /api/brayne-testimonials/submit` — the public form. `csrf: false`
  because the caller is an anonymous visitor with no session token to
  present; in exchange the route refuses cross-origin requests, honours the
  site's CAPTCHA, and is rate-limited. Everything arrives as pending.

The plugin's admin app runs in a same-origin iframe the host mounts for
`manifest.adminApp` routes. It reads the admin theme, locale, and catalog
URLs from the host over the admin-bridge `postMessage` protocol, reads the
`jf_csrf` cookie itself, and calls only the plugin's own routes above. The
host's generic plugin Settings page keeps working alongside it and writes the
same rows, so the two surfaces can never disagree about what is stored.

## Requirements

- JustFlows `>=0.4.0 <0.5.0`
- No database migrations, no schema tables, no secrets, no env vars.
- Email notifications use the host's `mail:send` capability; the plugin runs
  without it when no notification email is set.

## Develop

From the workspace (the pnpm workspace resolves the plugin package):

```powershell
pnpm --filter justflows.brayne-testimonials typecheck
pnpm --filter justflows.brayne-testimonials test
pnpm --filter justflows.brayne-testimonials build
```

Copy the built plugin into a JustFlows source checkout's `plugins/` folder so
the server discovers it, then activate at **Admin → Extensions → Plugins**, or
through the admin API:

```
GET  /api/plugins
POST /api/plugins/justflows.brayne-testimonials/activate
```

After changing the plugin's server code, rebuild (`pnpm --filter … build`)
and restart the dev server so the compiled module reloads. The admin app's
static files are re-read without a restart.

## Verify a live install

Against a running instance. The routes marked _admin_ need an administrator
session; anonymous callers get `403`.

```powershell
$origin = "http://localhost:3000"

# Assets are served from the manifest's assets.dir
Invoke-WebRequest "$origin/ext/justflows.brayne-testimonials/testimonials.js"
Invoke-WebRequest "$origin/ext/justflows.brayne-testimonials/review-form.js"

# The admin app's own files answer only inside an admin session
Invoke-WebRequest "$origin/ext/justflows.brayne-testimonials/admin/index.html"

# CAPTCHA config for an anonymous visitor
Invoke-WebRequest "$origin/api/brayne-testimonials/form-config"

# Public, rate-limited submit; the record shows up pending in the inbox
# POST $origin/api/brayne-testimonials/submit

# Admin-only: the admin app's data route (sign in first)
# GET $origin/api/brayne-testimonials/admin-data
```

## Package and install (release path)

A production site installs the plugin through the real upload route: **Admin →
Extensions → Plugins → Upload package**, picking the `.jfpkg` produced by the
packaging flow described in the JustFlows author docs. Activate from the same
screen afterwards. Installs are revisioned per version and digest, so
uploading a new build replaces the older revision and the site keeps running
the build whose digest matches.

Nothing in this repository publishes or pushes anything for you.

## Tests

`pnpm --filter justflows.brayne-testimonials test` runs five suites:

- `settings.test.ts` — every key's normalisation and bounds, defaults, and
  the partial-update rules the save route enforces.
- `records.test.ts` — record validation, the public submission subset, the
  display selection rules (approved only, minimum rating, featured pinning,
  ordering), and the aggregate stats.
- `render.test.ts` — the HTML renderer for all three blocks: layouts, styles,
  stars, initials chips, the empty state, and the honest strip.
- `blocks.test.ts` — the render-time prop contract: the registry renders
  `def.render(validateProps(storedProps))`, so the reviews and stats the
  `content.blocks` pass injects must survive `validateProps`, while a builder
  save (which never carries injected data) stores none of it.
- `manifest.test.ts` — `justflows.json` and the module manifest stay
  identical, both satisfy `PluginManifestSchema`, declared assets and
  admin-app files exist on disk, and the shipped English catalog is a flat,
  non-empty map.

## Author

Brayne Smart solutions Corp — <https://braynesmartsolutions.com> —
<support@braynesmartsolutions.com>

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).

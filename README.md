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
  pending, published, featured, and trash, stat tiles, one-click approve,
  feature, and trash, **bulk actions** across selected rows, **owner
  replies** that render under the review on the site, **internal notes**
  that never leave the inbox, **soft delete** with restore (delete forever
  only from the trash), and a full record editor with a star picker and
  per-field validation messages.
- **CSV export** of every record from the inbox header, RFC 4180, notes
  included: the owner's data, portable in one click.
- **Spam gate without a CAPTCHA provider**: a hidden honeypot and a
  faster-than-human timing check, judged server-side, answered with the same
  success shape a real submission gets.
- **Review activity strip** block: reviews published this month and the
  average rating of approved, rated reviews — plus a "With rating bars"
  variant that draws the honest five-star distribution from the same
  records. With nothing approved, the strip renders nothing at all — no
  invented numbers.
- **Verified badge**: a per-review "Verified by the site owner" attestation,
  one click in the inbox or a checkbox in the editor, rendered as a small
  badge on the card.
- **Autoplay slider**: optional, per block; pauses on hover and focus and
  never runs under reduced motion.
- **Collection link panel**: the admin stores the page address that holds the
  Review form block and can copy a shareable link, print it as a **QR counter
  card**, and send **review invitations** — one personalized email per
  customer, sent now, with their name pre-filled on the form.
- **CSV import**: paste rows on the Collect screen; every row is moderated
  before it appears, and each failed row is reported on its own.
- **Review photos and videos**: attach an image from the site's media library
  to any record (the form never accepts uploads), or a YouTube / Vimeo
  address that renders as a **click-to-load facade** — the embed only ever
  loads on the visitor's click, from the privacy-enhanced embed domains.
- **Tags**: one short label per record, and a per-block "Show only this tag"
  filter for grouping reviews by service or product line.

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
- **Photos are the owner's, videos load on click.** The form accepts no
  uploads — a review photo is an image the owner attached from the site's
  media library, after moderation. A video review is a link with a
  click-to-load facade: no third-party player request happens until a
  visitor clicks, and the embed uses the privacy-enhanced domains
  (`youtube-nocookie.com`, `player.vimeo.com`).

## Blocks

| Block           | Type                                    | Renders                                                                        |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Testimonials    | `justflows.brayne-testimonials.reviews` | Approved reviews in a grid, slider, or one feature quote; per-block tag filter |
| Review form     | `justflows.brayne-testimonials.form`    | The public collection form, using the site's CAPTCHA                           |
| Review activity | `justflows.brayne-testimonials.strip`   | Published this month and the average rating; empty when there is none          |

Three builder patterns (testimonial wall, hero quote, footer quote) reference
these block types, so a new page can start from a composed layout.

The reviews and the strip's stats are **render-time props**: the plugin's
`content.blocks` pass injects them into the stored tree immediately before the
page renders, so pages carry the reviews in their HTML. The builder never
sends them, so a page save stores none of it; the builder instead shows
`preview.sampleProps`, which are never saved.

## Theming

Every colour, surface, and radius the plugin draws reads from the `--jbt-*`
CSS custom properties defined in `public/testimonials.css`:

| Variable            | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `--jbt-star`        | Filled star colour                        |
| `--jbt-star-empty`  | Empty star colour                         |
| `--jbt-gold`        | Gold accent: counter pills, rating marks  |
| `--jbt-gold-soft`   | Soft gold background                      |
| `--jbt-accent`      | Hover and focus accent (video play glyph) |
| `--jbt-quote-mark`  | The feature layout's opening quote mark   |
| `--jbt-success`     | Approved / positive status                |
| `--jbt-pending`     | Pending status                            |
| `--jbt-danger`      | Danger / destructive status               |
| `--jbt-card-bg`     | Card surface                              |
| `--jbt-card-border` | Card hairline border                      |
| `--jbt-text-muted`  | Roles, dates, and secondary text          |
| `--jbt-radius`      | Card radius (12px)                        |
| `--jbt-radius-lg`   | Feature radius (18px)                     |
| `--jbt-radius-sm`   | Small control radius (5px)                |

The plugin's values are defaults, not assertions. The host loads the theme's
`theme.css` **after** the plugin stylesheet, so a theme that declares the same
names wins the cascade, site-wide. Two supported ways in:

- **In a theme package**: declare the names you want to control in the theme
  manifest's `customize` section and they appear in the site's theme
  customizer; list them under `blockControls` for
  `justflows.brayne-testimonials.reviews` and `.strip` to surface them as
  first-class per-block controls in the builder's Theme styling.
- **Per block**: the builder's Theme styling writes overrides as inline
  custom properties on the block's root element, which the plugin's styles
  read directly (verified: a block-level `--jbt-star` recolours every star
  in that block).

The dark palette switches with `prefers-color-scheme`; a theme overriding
these names can do the same inside its own media query.

## Static export

Verified against a real export run on a dev site (6 pages, 0 errors):

- **Display blocks degrade to plain HTML.** The reviews, the slider, and the
  activity strip render fully into the exported page — no script is needed
  to see them.
- **The slider without scripting** is a native scrollable strip; the arrows
  and dots are enhancements the script adds when it runs.
- **Video reviews never auto-load third parties.** The exported page carries
  the facade as a plain `target="_blank"` link; the iframe is only ever
  built by the click handler in `testimonials.js`. Without scripting, the
  link opens the video on its own site.
- **The review form posts to the live origin.** Its `form-config` route is
  CORS-enabled for exported pages, and the form reads the site's CAPTCHA
  configuration at submit time. The exporter copies the plugin's scripts
  and stylesheets into the export.
- **The form records the page's language** from the rendered `<html lang>`,
  so a review collected on a localized export still filters correctly.

## Settings

| Setting              | Default    | Notes                                                                                                                                  |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Notification email   | _(empty)_  | Where new submissions are announced. Empty sends no email. A send failure is logged, never surfaced to the visitor as a failed review. |
| Require CAPTCHA      | on         | Uses the site's own configured provider. With none configured, submissions rely on moderation.                                         |
| Minimum star rating  | no minimum | When set, unrated and lower-rated reviews are hidden from the site but stay visible in the inbox.                                      |
| Reviews page address | _(empty)_  | The page that holds the Review form block, so the admin can copy a shareable link.                                                     |

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
  newest pin sorts first), unfeature, trash (soft delete), restore, delete
  (permanent, from the trash).
- `GET /api/brayne-testimonials/export` — administrator-only CSV of every
  record, RFC 4180, notes included, `no-store`, delivered as a download.
- `POST /api/brayne-testimonials/invite` — administrator-only: sends one
  customer a personalized invitation with the reviews-page link (name
  pre-filled); the collection-link setting must be set first, and a send
  failure records nothing.
- `POST /api/brayne-testimonials/import` — administrator-only: imports up to
  200 CSV rows at once; every row validates like a public submission and
  lands pending, and failed rows are reported without stopping the rest.
- `GET /api/brayne-testimonials/form-config` — the CAPTCHA provider's public
  widget details for the form, `no-store`, CORS-enabled so a statically
  exported page can read it.
- `POST /api/brayne-testimonials/submit` — the public form. `csrf: false`
  because the caller is an anonymous visitor with no session token to
  present; in exchange the route refuses cross-origin requests, honours the
  site's CAPTCHA, is rate-limited, and silently drops a filled honeypot or a
  faster-than-human submission. Everything else arrives as pending.

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

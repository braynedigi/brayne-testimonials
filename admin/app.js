// SPDX-License-Identifier: GPL-2.0-or-later
//
// Brayne Testimonials admin app.
//
// Runs inside the Justflows admin shell in a same-origin iframe. The shell
// owns the sidebar and the page heading; this script builds the plugin's own
// screens inside the frame: the moderation inbox, the record editor, the
// settings, and the collection-link panel.
//
// Data comes from the plugin's own routes (`GET admin-data`, `PUT
// admin-settings`, `PUT record`, `POST moderate`); nothing is proxied
// through core. The host handshake is the admin-bridge postMessage protocol
// (vendored below, matching `@justflows/admin-bridge`): the host sends
// context (locale, theme, catalogs) after `ready`, and the frame reports its
// height and unsaved state.
//
// Every operator-entered value is rendered through textContent; the app never
// assigns markup, so a stored review can never inject anything here.

"use strict";

(function () {
  /** Message envelope the plugin frame and the admin host exchange. */
  var PLUGIN_SOURCE = "justflows-admin-plugin";
  var HOST_SOURCE = "justflows-admin-host";

  /** Neutral API base for this plugin's `ctx.http` routes. */
  var API_BASE = "/api/brayne-testimonials";

  /**
   * English catalog. The manifest also ships it as `locales/en.json` (the
   * host serves that file and passes its URL as `context.catalogs.en`),
   * which is fetched at boot and layered over this map so a future
   * translation only needs another locale file. The copy here is the
   * offline fallback.
   */
  var FALLBACK = {
    "app.name": "Testimonials",
    "app.backToInbox": "Back to inbox",
    "inbox.title": "Testimonials",
    "inbox.addManually": "Add manually",
    "inbox.settings": "Settings",
    "inbox.collect": "Collect reviews",
    "stats.total": "All reviews",
    "stats.approved": "Published",
    "stats.pending": "Awaiting approval",
    "stats.average": "Average rating",
    "stats.nothing": "Nothing yet",
    "banner.pending.title": "Reviews are waiting for approval",
    "banner.pending.body": "Nothing is published until you approve it.",
    "tab.all": "All",
    "tab.pending": "Pending",
    "tab.approved": "Published",
    "tab.featured": "Featured",
    "tab.trash": "Trash",
    "inbox.empty.title": "No testimonials yet",
    "inbox.empty.body": "Collect your first review, or add one manually.",
    "inbox.empty.collect": "Collect reviews",
    "inbox.empty.add": "Add one manually",
    "inbox.filtered.empty": "No reviews match this filter.",
    "inbox.export": "Export CSV",
    "record.pending": "Pending",
    "record.approved": "Published",
    "record.trashed": "Trashed",
    "record.featured": "Featured",
    "record.hiddenByMinimum": "Hidden by your display minimum",
    "record.replied": "Replied",
    "record.tagged": "Tag:",
    "record.hasPhoto": "Photo",
    "record.hasVideo": "Video",
    "record.verified": "Verified",
    "record.verify": "Verify",
    "record.unverify": "Unverify",
    "record.replyPreview": "Your reply:",
    "record.unrated": "No rating",
    "record.approve": "Approve",
    "record.unapprove": "Unpublish",
    "record.feature": "Feature",
    "record.unfeature": "Unfeature",
    "record.edit": "Edit",
    "record.trash": "Trash",
    "record.trashConfirm":
      "Move this review to trash? You can restore it from the Trash tab.",
    "record.restore": "Restore",
    "record.deleteForever": "Delete forever",
    "record.deleteForeverConfirm":
      "Delete this review for good? This cannot be undone.",
    "bulk.selectall": "Select all",
    "bulk.selected": "{n} selected",
    "bulk.approve": "Approve",
    "bulk.feature": "Feature",
    "bulk.trash": "Move to trash",
    "bulk.restore": "Restore",
    "bulk.deleteForever": "Delete forever",
    "bulk.deleteForeverConfirm":
      "Delete the selected reviews for good? This cannot be undone.",
    "bulk.done": "Bulk action",
    "editor.addTitle": "Add a testimonial",
    "editor.editTitle": "Edit testimonial",
    "editor.quote": "Review text",
    "editor.quote.hint": "The customer's own words, up to 500 characters.",
    "editor.quote.required": "The review text is required.",
    "editor.personName": "Reviewer name",
    "editor.personName.hint": "Shown under the quote.",
    "editor.personName.required": "The reviewer name is required.",
    "editor.role": "Role / company",
    "editor.role.hint": "Optional, for example 'CEO, Acme Ltd'.",
    "editor.avatarUrl": "Avatar image address",
    "editor.avatarUrl.hint":
      "Optional. An image from this site's media library, or leave empty for initials.",
    "editor.avatarUrl.invalid":
      "Enter an image address from this site, or leave it empty.",
    "editor.photoUrl": "Review photo",
    "editor.photoUrl.hint":
      "Optional. A photo you attach from this site's media library. The form never accepts uploads, so every photo is one you chose.",
    "editor.photoUrl.invalid":
      "Enter an image address from this site, or leave it empty.",
    "editor.videoUrl": "Video review",
    "editor.videoUrl.hint":
      "Optional. A YouTube or Vimeo address. The site shows a click-to-load player, so the video only loads when a visitor asks.",
    "editor.videoUrl.invalid":
      "Enter a YouTube or Vimeo address, or leave it empty.",
    "editor.tag": "Tag",
    "editor.tag.hint":
      "Optional, one short label such as 'Repairs'. A Testimonials block can show only one tag.",
    "editor.locale": "Language",
    "editor.locale.hint":
      "Optional, a language tag like en-US or nl. The review then only shows on pages of the same language; empty shows it everywhere.",
    "editor.locale.invalid":
      "Enter a language tag like en-US or nl, or leave it empty.",
    "editor.ownerReply": "Owner reply",
    "editor.ownerReply.hint":
      "Shown under the review on the site. Leave empty for no reply.",
    "editor.note": "Internal note",
    "editor.note.hint":
      "Only moderators see this. It is never shown on the site.",
    "editor.verified": "Verified by the site owner",
    "editor.verified.hint":
      "Your own attestation that this customer is real. The site shows it as a small badge.",
    "editor.rating": "Star rating",
    "editor.rating.hint": "Optional. Unrated reviews show no stars.",
    "editor.rating.none": "No rating",
    "editor.consent": "Permission to publish",
    "editor.consent.hint":
      "You confirm the customer allowed these words to be shown.",
    "editor.consent.required": "Permission to publish is required.",
    "editor.status": "Status",
    "editor.status.pending": "Pending - hidden until approved",
    "editor.status.approved": "Published - visible on the site",
    "editor.save": "Save testimonial",
    "editor.cancel": "Cancel",
    "settings.title": "Settings",
    "settings.notifications": "Notifications",
    "settings.notifyEmail": "Notification email",
    "settings.notifyEmail.hint":
      "Where new submissions are announced. Empty sends no email.",
    "settings.notifyEmail.invalid":
      "Enter a valid email address, or leave it empty.",
    "settings.moderation": "Moderation",
    "settings.requireCaptcha": "Require CAPTCHA",
    "settings.requireCaptcha.hint":
      "Uses the site's own configured provider. Every submission is moderated either way.",
    "settings.noCaptcha":
      "The site has no CAPTCHA configured, so submissions rely on moderation alone.",
    "settings.display": "Display",
    "settings.perBlock":
      "Stars, avatars, and dates are chosen per block in the page builder: open the page, select the Testimonials block, and switch them there.",
    "settings.layout": "Display layout",
    "settings.layout.grid": "Grid",
    "settings.layout.slider": "Slider",
    "settings.layout.feature": "Feature quote",
    "settings.layout.hint":
      "Applies the chosen layout to every Testimonials block on this site and publishes the pages it touches. The choice is stored on the blocks themselves, so the page builder stays truthful.",
    "settings.layout.apply": "Apply to every Testimonials block",
    "settings.layout.busy": "Applying...",
    "settings.layout.applied": "Applied to {n} page(s).",
    "settings.layout.none": "No pages with a Testimonials block were found.",
    "settings.layout.error": "The layout could not be applied: ",
    "settings.minRating": "Minimum star rating",
    "settings.minRating.hint":
      "0 shows everything. When a minimum is set, unrated reviews are hidden from the site but stay visible here.",
    "settings.save": "Save settings",
    "collect.title": "Collect reviews",
    "collect.step1": "Add the Review form block to a page",
    "collect.step1.body":
      "In the page builder, insert the Review form block wherever the form should appear. The form uses the site's CAPTCHA and every submission lands here as pending.",
    "collect.step2": "Tell the inbox where that page lives",
    "collect.step2.body":
      "Paste the page address below, including any language prefix (e.g. /nl-NL/reviews), so the links and QR code open the right page. The form on that page records the page's language for each review.",
    "collect.url": "Reviews page address",
    "collect.url.hint": "For example /reviews, or the full address.",
    "collect.url.invalid":
      "Enter the page address on this site (for example /reviews), or leave it empty.",
    "collect.copy": "Copy link",
    "collect.copied": "Link copied",
    "collect.saveUrl": "Save address",
    "collect.qr.title": "Counter card",
    "collect.qr.hint":
      "A QR code of the reviews page: print it for the counter, scan it from a phone.",
    "collect.qr.alt": "QR code for the reviews page",
    "collect.qr.download": "Download PNG",
    "collect.invite.title": "Invite a customer",
    "collect.invite.hint":
      "Sends a personal invitation with the reviews page link. No scheduler, no drip — one email, sent now.",
    "collect.invite.name": "Customer name (optional)",
    "collect.invite.name.hint":
      "The invitation greets them by name and pre-fills the form.",
    "collect.invite.email": "Email address",
    "collect.invite.email.hint": "Where the invitation is sent.",
    "collect.invite.note": "A line from you (optional)",
    "collect.invite.note.hint":
      "Added to the email, e.g. 'Thanks for the repair last week.'",
    "collect.invite.send": "Send invitation",
    "collect.invite.resend": "Re-send",
    "collect.invite.sent": "Invitations sent",
    "collect.invite.sentOk": "Invitation sent.",
    "collect.import.title": "Import reviews",
    "collect.import.hint":
      "Paste CSV rows — quote, name, role, rating. Every row is moderated before it appears.",
    "collect.import.paste": "Paste CSV",
    "collect.import.consent": "I confirm permission to publish was given",
    "collect.import.consent.hint":
      "Your attestation travels with every imported review, same as the editor's.",
    "collect.import.run": "Import as pending",
    "collect.import.done": "{n} imported, awaiting approval.",
    "collect.import.failed": "Row {row}: {error}",
    "collect.noUrl": "No address saved yet.",
    "collect.linkReady": "Share this link to collect reviews:",
    "save.savedSettings": "Settings saved",
    "save.savedRecord": "Testimonial saved",
    "save.saving": "Saving...",
    "save.unsaved": "Unsaved changes",
    "save.failed": "Couldn't save - fix the highlighted field.",
    "load.failed": "Couldn't load the Testimonials admin data.",
    "load.forbidden": "Your account can't manage these settings.",
    "role.moderate": "Moderation",
    "date.submitted": "Submitted",
    "date.approved": "Approved",
    noscript: "This screen needs JavaScript to run.",
  };

  var TABS = [
    { id: "all", labelKey: "tab.all" },
    { id: "pending", labelKey: "tab.pending" },
    { id: "approved", labelKey: "tab.approved" },
    { id: "featured", labelKey: "tab.featured" },
    { id: "trash", labelKey: "tab.trash" },
  ];

  /** The frame's state: one object, re-rendered on every deliberate change. */
  var state = {
    catalog: Object.assign({}, FALLBACK),
    theme: "",
    locale: "en",
    data: null,
    view: "inbox",
    tab: "all",
    draft: null,
    settingsDraft: null,
    dirty: false,
    saving: false,
    saved: false,
    loadError: "",
    saveError: "",
    fieldErrors: {},
    toastTimer: 0,
    /** The layout the Display screen would apply to every placed block. */
    layoutChoice: "slider",
    /** The last "Apply layout" outcome, or null when it has not run. */
    layoutApply: null,
    /** The inbox's row selection for bulk actions, keyed by record id. */
    bulk: {},
    bulkAll: false,
    /** The invite form's fields and the outcome line under it. */
    invite: { name: "", email: "", note: "" },
    inviteMessage: "",
    inviteBusy: false,
    /** The import box: pasted CSV, the consent attestation, the report. */
    importText: "",
    importConsent: false,
    importResult: null,
  };

  /** Look a label up in the loaded catalog, falling back to English. */
  function t(key) {
    var value = state.catalog[key];
    return typeof value === "string" && value ? value : FALLBACK[key] || key;
  }

  /* ------------------------------------------------------------ admin bridge */

  /**
   * Minimal client for the host's admin-bridge postMessage protocol (the
   * same envelope `@justflows/admin-bridge` implements; vendored so this
   * static app needs no bundler). Only the messages this app uses are
   * included.
   */
  function createAdminBridge() {
    var context = null;
    var contextListeners = [];
    var resizeObserver = null;
    var frame = 0;

    function post(message) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          Object.assign({ source: PLUGIN_SOURCE }, message),
          window.location.origin,
        );
      }
    }

    function currentHeight() {
      var el = document.documentElement;
      var body = document.body;
      return Math.max(
        Math.ceil(el.getBoundingClientRect().height),
        el.scrollHeight,
        body ? body.scrollHeight : 0,
      );
    }

    function onMessage(event) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      )
        return;
      var data = event.data;
      if (!data || data.source !== HOST_SOURCE) return;
      if (
        data.type === "context" &&
        data.context &&
        typeof data.context === "object"
      ) {
        context = data.context;
        contextListeners.forEach(function (listener) {
          listener(context);
        });
      }
    }

    window.addEventListener("message", onMessage);

    return {
      ready: function () {
        post({ type: "ready" });
      },
      onContext: function (listener) {
        contextListeners.push(listener);
        if (context) listener(context);
      },
      reportDirty: function (dirty) {
        post({ type: "dirty", dirty: dirty === true });
      },
      autoResize: function () {
        var report = function () {
          var ticket = ++frame;
          requestAnimationFrame(function () {
            if (ticket !== frame) return;
            post({ type: "resize", height: currentHeight() });
          });
        };
        report();
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(report);
          resizeObserver.observe(document.documentElement);
          if (document.body && document.body !== document.documentElement) {
            resizeObserver.observe(document.body);
          }
        }
        window.addEventListener("load", report);
      },
      destroy: function () {
        window.removeEventListener("message", onMessage);
        if (resizeObserver) resizeObserver.disconnect();
        contextListeners.length = 0;
      },
    };
  }

  var bridge = createAdminBridge();

  /* --------------------------------------------------------------- helpers */

  /** Create an element with attributes and children (text or nodes). */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        var value = attrs[name];
        if (value === null || value === undefined || value === false) return;
        /**
         * Event handlers must be assigned as properties. Stringifying a
         * function into an attribute would make the browser parse its source
         * as an inline handler body, where a parameterless function is a
         * syntax error and the control never fires.
         */
        if (name.slice(0, 2) === "on" && typeof value === "function") {
          el[name] = value;
          return;
        }
        if (name === "class") el.className = value;
        else if (name === "for") el.setAttribute("for", value);
        else if (name === "text") el.textContent = String(value);
        else el.setAttribute(name, value === true ? "" : String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(
        typeof child === "string" ? document.createTextNode(child) : child,
      );
    });
    return el;
  }

  /** A row of filled and hollow stars for a rating, or the unrated note. */
  function starRow(rating) {
    if (rating === null || rating === undefined) {
      return h("span", { class: "jbt-record__meta" }, [t("record.unrated")]);
    }
    var row = h("span", {
      class: "jbt-stars",
      role: "img",
      "aria-label": "Rated " + rating + " of 5 stars",
    });
    for (var index = 0; index < 5; index += 1) {
      row.appendChild(
        h(
          "span",
          {
            class:
              "jbt-star " + (index < rating ? "jbt-star--on" : "jbt-star--off"),
          },
          ["\u2605"],
        ),
      );
    }
    return row;
  }

  /** "12 Nov 2026" from an ISO timestamp, in the viewer's locale. */
  function friendlyDate(iso) {
    var parsed = Date.parse(iso || "");
    if (!Number.isFinite(parsed)) return "";
    return new Date(parsed).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function readCsrfCookie() {
    var match = document.cookie.match(/(?:^|; )jf_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /** Same-origin JSON fetch; the frame shares the operator's session cookies. */
  function fetchJson(path, options) {
    return fetch(
      path,
      Object.assign({ credentials: "same-origin", cache: "no-store" }, options),
    ).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
    });
  }

  /** Read one draft value for the active view, so re-renders keep edits. */
  function draftValue(key) {
    if (state.view === "editor" && state.draft) return state.draft[key];
    if (state.view === "settings" && state.settingsDraft)
      return state.settingsDraft[key];
    return undefined;
  }

  /**
   * Record a change in the active draft. Input events never re-render: focus
   * would jump mid-typing. Only the save button and the unsaved pill are
   * patched in place.
   */
  function setDraftValue(key, value) {
    var draft = state.view === "editor" ? state.draft : state.settingsDraft;
    if (!draft || draft[key] === value) return;
    draft[key] = value;
    if (!state.dirty) {
      state.dirty = true;
      bridge.reportDirty(true);
    }
    if (state.fieldErrors[key]) {
      delete state.fieldErrors[key];
      render();
      return;
    }
    patchSaveControls();
  }

  /** Patch the save button and the unsaved pill without a full re-render. */
  function patchSaveControls() {
    var save = document.getElementById("jbt-save");
    if (save) save.disabled = state.saving || !state.dirty;
    var head = document.querySelector(".jbt-head-actions");
    if (head && state.dirty && !document.getElementById("jbt-unsaved")) {
      head.insertBefore(
        h("span", {
          class: "jbt-pill jbt-pill--muted",
          id: "jbt-unsaved",
          text: t("save.unsaved"),
        }),
        head.firstChild,
      );
    }
  }

  /** Reset the dirty state after a successful save. */
  function clearDirty() {
    state.dirty = false;
    bridge.reportDirty(false);
  }

  /** The save button's id, shared by the editor and settings views. */
  function saveButton(saveKey) {
    return h(
      "button",
      {
        id: "jbt-save",
        class: "jbt-btn jbt-btn--primary",
        type: "button",
        disabled: state.saving || !state.dirty,
        onclick: state.view === "editor" ? saveRecord : saveSettings,
      },
      [t(state.saving ? "save.saving" : saveKey)],
    );
  }

  function fieldError(key) {
    var message = state.fieldErrors[key];
    return message
      ? h("p", { class: "jbt-field__error", role: "alert", text: message })
      : null;
  }

  /** A toggle row: real checkbox, label, and hint beside it. */
  function checkrowNode(key, labelKey, hintKey) {
    return h("label", { class: "jbt-checkrow" }, [
      h("input", {
        type: "checkbox",
        checked: draftValue(key) === true,
        onchange: function (event) {
          setDraftValue(key, event.target.checked);
        },
      }),
      h("span", { class: "jbt-checkrow__text" }, [
        h("span", { class: "jbt-checkrow__label", text: t(labelKey) }),
        h("span", { class: "jbt-checkrow__meta", text: t(hintKey) }),
      ]),
    ]);
  }

  /** A labelled text field the draft backs. */
  function labeledInput(key, labelKey, hintKey, options) {
    options = options || {};
    var input = h(options.multiline ? "textarea" : "input", {
      id: "jbt-field-" + key,
      class: "jbt-input",
      "aria-invalid": state.fieldErrors[key] ? "true" : null,
      placeholder: options.placeholder || "",
      maxlength: options.maxlength,
      rows: options.rows,
    });
    input.value = String(draftValue(key) ?? "");
    input.addEventListener("input", function (event) {
      setDraftValue(key, event.target.value);
    });
    return h("div", { class: "jbt-field" }, [
      h("label", {
        class: "jbt-field__label",
        for: "jbt-field-" + key,
        text: t(labelKey),
      }),
      input,
      fieldError(key),
      h("p", { class: "jbt-field__hint", text: t(hintKey) }),
    ]);
  }

  /** A select the draft backs. */
  function labeledSelect(key, labelKey, hintKey, choices) {
    var select = h("select", {
      id: "jbt-field-" + key,
      class: "jbt-input",
      onchange: function (event) {
        setDraftValue(key, event.target.value);
      },
    });
    choices.forEach(function (choice) {
      var option = h("option", { value: choice.value }, [choice.label]);
      if (String(draftValue(key)) === String(choice.value))
        option.selected = true;
      select.appendChild(option);
    });
    return h("div", { class: "jbt-field" }, [
      h("label", {
        class: "jbt-field__label",
        for: "jbt-field-" + key,
        text: t(labelKey),
      }),
      select,
      fieldError(key),
      hintKey ? h("p", { class: "jbt-field__hint", text: t(hintKey) }) : null,
    ]);
  }

  /* ------------------------------------------------------------- data load */

  function loadData() {
    return fetchJson(API_BASE + "/admin-data").then(function (result) {
      if (!result.ok) {
        state.loadError =
          result.status === 403 ? t("load.forbidden") : t("load.failed");
        state.data = null;
        return;
      }
      state.loadError = "";
      state.data = result.body;
      if (!state.draft) state.draft = null;
      if (!state.settingsDraft)
        state.settingsDraft = Object.assign({}, result.body.settings);
    });
  }

  /* -------------------------------------------------------------- rendering */

  function render() {
    var root = document.getElementById("app");
    while (root.firstChild) root.removeChild(root.firstChild);
    if (state.loadError && !state.data) {
      root.appendChild(
        h("div", { class: "jbt-banner jbt-banner--error", role: "alert" }, [
          h("div", { class: "jbt-banner__text" }, [
            h("p", { class: "jbt-banner__title", text: state.loadError }),
          ]),
        ]),
      );
      return;
    }
    if (!state.data) {
      root.appendChild(
        h("div", { class: "jbt-skeleton", "aria-hidden": "true" }),
      );
      return;
    }

    var views = {
      inbox: renderInbox,
      editor: renderEditor,
      settings: renderSettings,
      collect: renderCollect,
    };
    root.appendChild(views[state.view]());

    if (state.saved) {
      root.appendChild(
        h("div", { class: "jbt-toast", role: "status" }, [
          h("span", { class: "jbt-dot" }),
          t("save.saved" + (state.savedKind || "Settings")),
        ]),
      );
      if (state.toastTimer) window.clearTimeout(state.toastTimer);
      state.toastTimer = window.setTimeout(function () {
        state.saved = false;
        render();
      }, 3200);
    }
  }

  /* ----------------------------------------------------------------- inbox */

  function renderInbox() {
    var data = state.data;
    var stats = data.stats;
    var records = data.records;
    var wrap = h("div", { class: "jbt-view" }, []);

    wrap.appendChild(
      h("header", { class: "jbt-head" }, [
        h("div", {}, [
          h("h1", { text: t("inbox.title") }),
          h("p", { class: "jbt-id", text: "justflows.brayne-testimonials" }),
        ]),
        h("div", { class: "jbt-head-actions" }, [
          h(
            "a",
            {
              class: "jbt-btn jbt-btn--ghost",
              href: "/api/brayne-testimonials/export",
            },
            [t("inbox.export")],
          ),
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--ghost",
              type: "button",
              onclick: function () {
                openView("collect");
              },
            },
            [t("inbox.collect")],
          ),
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--ghost",
              type: "button",
              onclick: function () {
                openView("settings");
              },
            },
            [t("inbox.settings")],
          ),
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--primary",
              type: "button",
              onclick: function () {
                openEditor(null);
              },
            },
            [t("inbox.addManually")],
          ),
        ]),
      ]),
    );

    var stat = function (labelKey, value, gold) {
      return h("div", { class: "jbt-stat" }, [
        h("div", { class: "jbt-stat__label", text: t(labelKey) }),
        h("div", {
          class:
            "jbt-stat__value" +
            (gold
              ? " jbt-stat__value--gold"
              : value === null
                ? " jbt-stat__value--muted"
                : ""),
          text: value === null ? "-" : String(value),
        }),
      ]);
    };

    wrap.appendChild(
      h("div", { class: "jbt-stats" }, [
        stat("stats.total", stats.total),
        stat("stats.approved", stats.approved),
        stat("stats.pending", stats.pending),
        stat("stats.average", stats.averageRating, true),
      ]),
    );

    if (stats.pending > 0) {
      wrap.appendChild(
        h("div", { class: "jbt-banner", role: "alert" }, [
          h("div", { class: "jbt-banner__text" }, [
            h("p", { class: "jbt-banner__title" }, [
              stats.pending + " " + t("banner.pending.title"),
            ]),
            h("p", {
              class: "jbt-banner__body",
              text: t("banner.pending.body"),
            }),
          ]),
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--primary",
              type: "button",
              onclick: function () {
                state.tab = "pending";
                render();
              },
            },
            [t("tab.pending")],
          ),
        ]),
      );
    }

    var tablist = h(
      "div",
      { class: "jbt-tabs", role: "tablist", "aria-label": t("role.moderate") },
      [],
    );
    var counts = {
      /** "All" is everything the owner moderates; trash has its own tab. */
      all: records.filter(function (record) {
        return record.status !== "trash";
      }).length,
      pending: stats.pending,
      approved: stats.approved,
      featured: stats.featured,
      trash: records.filter(function (record) {
        return record.status === "trash";
      }).length,
    };
    TABS.forEach(function (entry) {
      tablist.appendChild(
        h(
          "button",
          {
            class: "jbt-tab",
            type: "button",
            role: "tab",
            "aria-selected": String(state.tab === entry.id),
            tabindex: state.tab === entry.id ? "0" : "-1",
            onclick: function () {
              state.tab = entry.id;
              state.bulk = {};
              state.bulkAll = false;
              render();
            },
          },
          [t(entry.labelKey) + " (" + counts[entry.id] + ")"],
        ),
      );
    });
    wrap.appendChild(tablist);

    var visible = records.filter(function (record) {
      if (state.tab === "pending") return record.status === "pending";
      if (state.tab === "approved") return record.status === "approved";
      if (state.tab === "featured") return Boolean(record.featuredAt);
      if (state.tab === "trash") return record.status === "trash";
      return record.status !== "trash";
    });

    if (records.length === 0) {
      wrap.appendChild(
        h("div", { class: "jbt-card" }, [
          h("div", { class: "jbt-card__head" }, [
            h("h2", { class: "jbt-card__title", text: t("inbox.empty.title") }),
          ]),
          h("div", { class: "jbt-card__body" }, [
            h("p", { class: "jbt-field__hint", text: t("inbox.empty.body") }),
            h("div", { class: "jbt-record__actions" }, [
              h(
                "button",
                {
                  class: "jbt-btn jbt-btn--primary",
                  type: "button",
                  onclick: function () {
                    openView("collect");
                  },
                },
                [t("inbox.empty.collect")],
              ),
              h(
                "button",
                {
                  class: "jbt-btn jbt-btn--ghost",
                  type: "button",
                  onclick: function () {
                    openEditor(null);
                  },
                },
                [t("inbox.empty.add")],
              ),
            ]),
          ]),
        ]),
      );
      return wrap;
    }

    if (visible.length === 0) {
      wrap.appendChild(
        h("p", { class: "jbt-field__hint", text: t("inbox.filtered.empty") }),
      );
      return wrap;
    }

    /** The select-all row and the bulk bar, above the cards they act on. */
    wrap.appendChild(bulkBar(visible));

    visible.forEach(function (record) {
      wrap.appendChild(recordCard(record));
    });

    return wrap;
  }

  /**
   * The bulk header: one select-all checkbox plus, once anything is picked,
   * the actions that make sense for the tab. Each action walks the selection
   * through the same per-record route the single buttons use, so there is
   * exactly one moderation path on the server.
   */
  function bulkBar(visible) {
    var selected = visible.filter(function (record) {
      return state.bulk[record.id] === true;
    });

    var selectAll = h("input", { type: "checkbox" });
    selectAll.checked =
      selected.length === visible.length && visible.length > 0;
    selectAll.addEventListener("change", function (event) {
      state.bulkAll = event.target.checked;
      state.bulk = {};
      if (state.bulkAll) {
        visible.forEach(function (record) {
          state.bulk[record.id] = true;
        });
      }
      render();
    });

    var bar = h("div", { class: "jbt-bulk" }, [
      h("label", { class: "jbt-bulk__select" }, [
        selectAll,
        h("span", {
          text:
            selected.length > 0
              ? t("bulk.selected").replace("{n}", String(selected.length))
              : t("bulk.selectall"),
        }),
      ]),
    ]);

    if (selected.length === 0) return bar;

    var run = function (action) {
      /** The fresh payload after each call moves records between tabs, so
       * the selection is captured before the first call runs. */
      var ids = selected.map(function (record) {
        return record.id;
      });
      state.bulk = {};
      state.bulkAll = false;
      var chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          return send("POST", "/moderate", { id: id, action: action });
        });
      });
      chain
        .then(function () {
          return send("GET", "/admin-data");
        })
        .then(function (result) {
          if (result.ok) {
            state.data = result.body;
            state.saved = true;
            state.savedKind = t("bulk.done");
            render();
          }
        })
        .catch(function () {
          render();
        });
    };

    var buttons = h("div", { class: "jbt-bulk__actions" }, []);
    if (state.tab === "trash") {
      buttons.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--primary",
            type: "button",
            onclick: function () {
              run("restore");
            },
          },
          [t("bulk.restore")],
        ),
      );
      buttons.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--danger",
            type: "button",
            onclick: function () {
              if (window.confirm(t("bulk.deleteForeverConfirm"))) run("delete");
            },
          },
          [t("bulk.deleteForever")],
        ),
      );
    } else {
      buttons.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--primary",
            type: "button",
            onclick: function () {
              run("approve");
            },
          },
          [t("bulk.approve")],
        ),
      );
      buttons.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--quiet",
            type: "button",
            onclick: function () {
              run("feature");
            },
          },
          [t("bulk.feature")],
        ),
      );
      buttons.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--danger",
            type: "button",
            onclick: function () {
              run("trash");
            },
          },
          [t("bulk.trash")],
        ),
      );
    }
    bar.appendChild(buttons);
    return bar;
  }

  /** One inbox card: identity, quote, state, and the moderation actions. */
  function recordCard(record) {
    var min = state.data.settings.minRatingToDisplay;
    var pills = h("div", { class: "jbt-record__pills" }, []);
    pills.appendChild(
      h(
        "span",
        {
          class:
            "jbt-pill " +
            (record.status === "approved"
              ? "jbt-pill--success"
              : record.status === "trash"
                ? "jbt-pill--muted"
                : "jbt-pill--warning"),
        },
        [
          h("span", { class: "jbt-dot" }),
          t(
            record.status === "approved"
              ? "record.approved"
              : record.status === "trash"
                ? "record.trashed"
                : "record.pending",
          ),
        ],
      ),
    );
    if (record.featuredAt) {
      pills.appendChild(
        h("span", { class: "jbt-pill" }, ["\u2605 " + t("record.featured")]),
      );
    }
    if (record.verified) {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--muted" }, [
          t("record.verified"),
        ]),
      );
    }
    if (min >= 1 && record.rating === null && record.status === "approved") {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--muted" }, [
          t("record.hiddenByMinimum"),
        ]),
      );
    }
    if (record.ownerReply) {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--muted" }, [t("record.replied")]),
      );
    }
    if (record.tag) {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--tag" }, [
          t("record.tagged") + " " + record.tag,
        ]),
      );
    }
    if (record.photoUrl || record.videoUrl) {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--tag" }, [
          record.videoUrl ? t("record.hasVideo") : t("record.hasPhoto"),
        ]),
      );
    }
    if (record.locale) {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--tag" }, [record.locale]),
      );
    }

    /** The row's pick checkbox, wired to the bulk state. */
    var pick = h("input", { type: "checkbox" });
    pick.checked = state.bulk[record.id] === true;
    pick.addEventListener("change", function (event) {
      if (event.target.checked) state.bulk[record.id] = true;
      else delete state.bulk[record.id];
      render();
    });

    var actions = h("div", { class: "jbt-record__actions" }, []);
    if (record.status === "trash") {
      /** Trashed rows offer the way back, and the permanent way out. */
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--primary",
            type: "button",
            onclick: function () {
              moderate(record.id, "restore");
            },
          },
          [t("record.restore")],
        ),
      );
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--ghost",
            type: "button",
            onclick: function () {
              openEditor(record.id);
            },
          },
          [t("record.edit")],
        ),
      );
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--danger",
            type: "button",
            onclick: function () {
              if (window.confirm(t("record.deleteForeverConfirm")))
                moderate(record.id, "delete");
            },
          },
          [t("record.deleteForever")],
        ),
      );
    } else {
      actions.appendChild(
        h(
          "button",
          {
            class:
              "jbt-btn " +
              (record.status === "approved"
                ? "jbt-btn--quiet"
                : "jbt-btn--primary"),
            type: "button",
            onclick: function () {
              moderate(
                record.id,
                record.status === "approved" ? "unapprove" : "approve",
              );
            },
          },
          [
            t(
              record.status === "approved"
                ? "record.unapprove"
                : "record.approve",
            ),
          ],
        ),
      );
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--quiet",
            type: "button",
            onclick: function () {
              moderate(record.id, record.featuredAt ? "unfeature" : "feature");
            },
          },
          [t(record.featuredAt ? "record.unfeature" : "record.feature")],
        ),
      );
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--quiet",
            type: "button",
            onclick: function () {
              moderate(record.id, record.verified ? "unverify" : "verify");
            },
          },
          [t(record.verified ? "record.unverify" : "record.verify")],
        ),
      );
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--ghost",
            type: "button",
            onclick: function () {
              openEditor(record.id);
            },
          },
          [t("record.edit")],
        ),
      );
      actions.appendChild(
        h(
          "button",
          {
            class: "jbt-btn jbt-btn--danger",
            type: "button",
            onclick: function () {
              if (window.confirm(t("record.trashConfirm")))
                moderate(record.id, "trash");
            },
          },
          [t("record.trash")],
        ),
      );
    }

    return h("article", { class: "jbt-record" }, [
      h("div", { class: "jbt-record__top" }, [
        h("label", { class: "jbt-record__pick" }, [
          pick,
          h("span", { class: "jbt-visually-hidden", text: record.personName }),
        ]),
        h("div", { class: "jbt-record__who" }, [
          h("div", { class: "jbt-record__name", text: record.personName }),
          record.role
            ? h("div", { class: "jbt-record__role", text: record.role })
            : null,
        ]),
        pills,
      ]),
      starRow(record.rating),
      h("blockquote", { class: "jbt-record__quote", text: record.quote }),
      record.ownerReply
        ? h("p", {
            class: "jbt-record__meta",
            text: t("record.replyPreview") + " " + record.ownerReply,
          })
        : null,
      h("div", { class: "jbt-record__meta" }, [
        t("date.submitted") + " " + friendlyDate(record.submittedAt),
        record.approvedAt
          ? " \u00b7 " +
            t("date.approved") +
            " " +
            friendlyDate(record.approvedAt)
          : "",
      ]),
      actions,
    ]);
  }

  /* ---------------------------------------------------------------- editor */

  function openEditor(id) {
    if (id) {
      var existing = state.data.records.find(function (record) {
        return record.id === id;
      });
      state.draft = existing ? Object.assign({}, existing) : null;
    } else {
      state.draft = {
        id: "",
        quote: "",
        personName: "",
        role: "",
        rating: null,
        avatarUrl: "",
        photoUrl: "",
        videoUrl: "",
        tag: "",
        locale: "",
        ownerReply: "",
        note: "",
        verified: false,
        consent: true,
        status: "pending",
        source: "manual",
      };
    }
    openView("editor");
  }

  /** The star picker: no rating plus one to five, aria-pressed buttons. */
  function ratingPicker() {
    var row = h(
      "div",
      { class: "jbt-picker", role: "group", "aria-label": t("editor.rating") },
      [],
    );
    var options = [{ value: null, label: t("editor.rating.none") }];
    for (var stars = 1; stars <= 5; stars += 1) {
      options.push({ value: stars, label: "\u2605 " + stars });
    }
    options.forEach(function (option) {
      var pressed = state.draft && state.draft.rating === option.value;
      row.appendChild(
        h(
          "button",
          {
            class: "jbt-picker__option",
            type: "button",
            "aria-pressed": String(pressed),
            onclick: function () {
              setDraftValue("rating", option.value);
              render();
            },
          },
          [option.label],
        ),
      );
    });
    return row;
  }

  function renderEditor() {
    var wrap = h("div", { class: "jbt-view" }, []);
    var isEdit = Boolean(state.draft && state.draft.id);

    wrap.appendChild(
      h("header", { class: "jbt-head" }, [
        h("div", {}, [
          h("h1", { text: t(isEdit ? "editor.editTitle" : "editor.addTitle") }),
          h("p", { class: "jbt-id", text: t("inbox.title") }),
        ]),
        h("div", { class: "jbt-head-actions" }, [
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--ghost",
              type: "button",
              onclick: function () {
                state.draft = null;
                openView("inbox");
              },
            },
            [t("editor.cancel")],
          ),
          saveButton("editor.save"),
        ]),
      ]),
    );

    if (state.saveError) {
      wrap.appendChild(
        h("div", { class: "jbt-banner jbt-banner--error", role: "alert" }, [
          h("div", { class: "jbt-banner__text" }, [
            h("p", { class: "jbt-banner__title", text: state.saveError }),
          ]),
        ]),
      );
    }

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", {
            class: "jbt-card__title",
            text: t(isEdit ? "editor.editTitle" : "editor.addTitle"),
          }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          labeledInput("quote", "editor.quote", "editor.quote.hint", {
            multiline: true,
            rows: 4,
            maxlength: 500,
          }),
          labeledInput(
            "personName",
            "editor.personName",
            "editor.personName.hint",
            {
              maxlength: 60,
            },
          ),
          labeledInput("role", "editor.role", "editor.role.hint", {
            maxlength: 80,
          }),
          labeledInput(
            "avatarUrl",
            "editor.avatarUrl",
            "editor.avatarUrl.hint",
            {
              maxlength: 500,
            },
          ),
          labeledInput("photoUrl", "editor.photoUrl", "editor.photoUrl.hint", {
            maxlength: 500,
          }),
          labeledInput("videoUrl", "editor.videoUrl", "editor.videoUrl.hint", {
            maxlength: 500,
          }),
          labeledInput("tag", "editor.tag", "editor.tag.hint", {
            maxlength: 40,
          }),
          labeledInput("locale", "editor.locale", "editor.locale.hint", {
            maxlength: 40,
          }),
          labeledInput(
            "ownerReply",
            "editor.ownerReply",
            "editor.ownerReply.hint",
            {
              multiline: true,
              rows: 3,
              maxlength: 500,
            },
          ),
          labeledInput("note", "editor.note", "editor.note.hint", {
            multiline: true,
            rows: 2,
            maxlength: 300,
          }),
          checkrowNode("verified", "editor.verified", "editor.verified.hint"),
          h("div", { class: "jbt-field" }, [
            h("span", { class: "jbt-field__label", text: t("editor.rating") }),
            ratingPicker(),
            h("p", { class: "jbt-field__hint", text: t("editor.rating.hint") }),
          ]),
          h("div", { class: "jbt-field" }, [
            labeledSelect("status", "editor.status", null, [
              { value: "pending", label: t("editor.status.pending") },
              { value: "approved", label: t("editor.status.approved") },
            ]),
          ]),
          checkrowNode("consent", "editor.consent", "editor.consent.hint"),
        ]),
      ]),
    );

    return wrap;
  }

  /* -------------------------------------------------------------- settings */

  function renderSettings() {
    var wrap = h("div", { class: "jbt-view" }, []);
    var noCaptcha = state.data.captcha && state.data.captcha.provider === null;

    wrap.appendChild(
      h("header", { class: "jbt-head" }, [
        h("div", {}, [
          h("h1", { text: t("settings.title") }),
          h("p", { class: "jbt-id", text: t("inbox.title") }),
        ]),
        h("div", { class: "jbt-head-actions" }, [
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--ghost",
              type: "button",
              onclick: function () {
                openView("inbox");
              },
            },
            [t("app.backToInbox")],
          ),
          saveButton("settings.save"),
        ]),
      ]),
    );

    if (state.saveError) {
      wrap.appendChild(
        h("div", { class: "jbt-banner jbt-banner--error", role: "alert" }, [
          h("div", { class: "jbt-banner__text" }, [
            h("p", { class: "jbt-banner__title", text: state.saveError }),
          ]),
        ]),
      );
    }

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", {
            class: "jbt-card__title",
            text: t("settings.notifications"),
          }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          labeledInput(
            "notifyEmail",
            "settings.notifyEmail",
            "settings.notifyEmail.hint",
            {
              maxlength: 200,
            },
          ),
        ]),
      ]),
    );

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", { class: "jbt-card__title", text: t("settings.moderation") }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          checkrowNode(
            "requireCaptcha",
            "settings.requireCaptcha",
            "settings.requireCaptcha.hint",
          ),
          noCaptcha
            ? h(
                "div",
                { class: "jbt-banner jbt-banner--info", role: "status" },
                [
                  h("div", { class: "jbt-banner__text" }, [
                    h("p", {
                      class: "jbt-banner__title",
                      text: t("settings.noCaptcha"),
                    }),
                  ]),
                ],
              )
            : null,
        ]),
      ]),
    );

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", { class: "jbt-card__title", text: t("settings.display") }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          /**
           * Stars, avatars, and dates are per-block choices in the page
           * builder, so the screen says where they live rather than offering
           * site toggles the placed blocks never read.
           */
          h("p", { class: "jbt-hint", text: t("settings.perBlock") }),
          /**
           * Layout is different: this one really can be switched here. The
           * button edits every placed Testimonials block on the site through
           * the content API and publishes the pages it touched, so what the
           * admin sees is what the site shows.
           */
          layoutApplyNode(),
          labeledSelect(
            "minRatingToDisplay",
            "settings.minRating",
            "settings.minRating.hint",
            [
              { value: "0", label: "No minimum" },
              { value: "1", label: "1 star and above" },
              { value: "2", label: "2 stars and above" },
              { value: "3", label: "3 stars and above" },
              { value: "4", label: "4 stars and above" },
              { value: "5", label: "5 stars only" },
            ],
          ),
        ]),
      ]),
    );

    return wrap;
  }

  /* --------------------------------------------------- apply-layout control */

  /**
   * The layout switch on the Display screen. Unlike the settings around it,
   * this control edits the placed Testimonials blocks themselves: every
   * reviews block on every page gets the chosen layout, and each touched
   * page is published. One click here and the site changes, with no draft to
   * remember to publish.
   */
  function layoutApplyNode() {
    var busy = state.layoutApply && state.layoutApply.status === "busy";
    var choices = [
      { value: "grid", label: t("settings.layout.grid") },
      { value: "slider", label: t("settings.layout.slider") },
      { value: "feature", label: t("settings.layout.feature") },
    ];
    var select = h("select", { class: "jbt-input", id: "jbt-layout" });
    choices.forEach(function (choice) {
      var option = h("option", { value: choice.value }, [choice.label]);
      if (state.layoutChoice === choice.value) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", function (event) {
      state.layoutChoice = event.target.value;
    });
    return h("div", { class: "jbt-field" }, [
      h("label", {
        class: "jbt-field__label",
        for: "jbt-layout",
        text: t("settings.layout"),
      }),
      select,
      h("p", { class: "jbt-field__hint", text: t("settings.layout.hint") }),
      h(
        "button",
        {
          class: "jbt-btn",
          type: "button",
          disabled: busy ? "disabled" : null,
          onclick: function () {
            applyLayoutEverywhere(state.layoutChoice);
          },
        },
        [busy ? t("settings.layout.busy") : t("settings.layout.apply")],
      ),
      state.layoutApply && state.layoutApply.message
        ? h(
            "p",
            {
              class:
                state.layoutApply.status === "error"
                  ? "jbt-field__error"
                  : "jbt-field__hint",
              role: "status",
              text: state.layoutApply.message,
            },
            [],
          )
        : null,
    ]);
  }

  /** Set the layout on every reviews node in a block tree, in place. */
  function markReviewsBlocks(nodes, layout) {
    if (!Array.isArray(nodes)) return false;
    var changed = false;
    nodes.forEach(function (node) {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        if (node.type === "justflows.brayne-testimonials.reviews") {
          if (
            !node.props ||
            typeof node.props !== "object" ||
            Array.isArray(node.props)
          ) {
            node.props = {};
          }
          if (node.props.layout !== layout) {
            node.props.layout = layout;
            changed = true;
          }
        }
        if (
          Array.isArray(node.children) &&
          markReviewsBlocks(node.children, layout)
        ) {
          changed = true;
        }
      }
    });
    return changed;
  }

  /**
   * Walk every page, apply the layout to its reviews blocks, and publish the
   * pages that changed. Runs with the administrator session the host already
   * gave this app, exactly like the app's own routes.
   */
  function applyLayoutEverywhere(layout) {
    if (!layout || ["grid", "slider", "feature"].indexOf(layout) < 0) return;
    state.layoutApply = { status: "busy", message: "" };
    render();

    sendHost("GET", "/api/content")
      .then(function (list) {
        var items =
          list.body && Array.isArray(list.body.items)
            ? list.body.items.filter(function (row) {
                return row && row.type === "page";
              })
            : [];
        var touched = 0;
        var chain = Promise.resolve();
        items.forEach(function (page) {
          chain = chain
            .then(function () {
              return sendHost("GET", "/api/content/" + page.id);
            })
            .then(function (row) {
              var blocks = row.body && row.body.blocks;
              if (!blocks || !Array.isArray(blocks.blocks)) return null;
              if (!markReviewsBlocks(blocks.blocks, layout)) return null;
              return sendHost("PATCH", "/api/content/" + page.id, {
                blocks: blocks,
              })
                .then(function (patched) {
                  if (!patched.ok) throw page.title;
                  return sendHost(
                    "POST",
                    "/api/content/" + page.id + "/publish",
                    {},
                  );
                })
                .then(function (published) {
                  if (!published.ok) throw page.title;
                  touched += 1;
                });
            });
        });
        return chain.then(function () {
          return touched;
        });
      })
      .then(function (touched) {
        state.layoutApply = {
          status: "done",
          message:
            touched > 0
              ? t("settings.layout.applied").replace("{n}", String(touched))
              : t("settings.layout.none"),
        };
        render();
      })
      .catch(function (failed) {
        state.layoutApply = {
          status: "error",
          message:
            t("settings.layout.error") +
            (typeof failed === "string" && failed ? failed : ""),
        };
        render();
      });
  }

  /** A host API call (outside the plugin's own namespace) with the session CSRF. */
  function sendHost(method, path, body) {
    var token = readCsrfCookie();
    var attempt = token
      ? Promise.resolve(token)
      : fetch("/api/auth/csrf", { credentials: "same-origin" })
          .catch(function () {
            return null;
          })
          .then(function () {
            return readCsrfCookie();
          });

    return attempt.then(function (csrf) {
      return fetchJson(path, {
        method: method,
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf || "",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    });
  }

  /* --------------------------------------------------------------- collect */

  function renderCollect() {
    var wrap = h("div", { class: "jbt-view" }, []);
    var url = state.settingsDraft
      ? String(state.settingsDraft.collectionUrl || "")
      : "";

    wrap.appendChild(
      h("header", { class: "jbt-head" }, [
        h("div", {}, [
          h("h1", { text: t("collect.title") }),
          h("p", { class: "jbt-id", text: t("inbox.title") }),
        ]),
        h("div", { class: "jbt-head-actions" }, [
          h(
            "button",
            {
              class: "jbt-btn jbt-btn--ghost",
              type: "button",
              onclick: function () {
                openView("inbox");
              },
            },
            [t("app.backToInbox")],
          ),
        ]),
      ]),
    );

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", { class: "jbt-card__title", text: t("collect.step1") }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          h("p", { class: "jbt-field__hint", text: t("collect.step1.body") }),
        ]),
      ]),
    );

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", { class: "jbt-card__title", text: t("collect.step2") }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          h("p", { class: "jbt-field__hint", text: t("collect.step2.body") }),
          labeledInput("collectionUrl", "collect.url", "collect.url.hint", {
            placeholder: "/reviews",
            maxlength: 500,
          }),
          h("div", { class: "jbt-record__actions" }, [
            saveButton("collect.saveUrl"),
          ]),
        ]),
      ]),
    );

    if (url) {
      var absolute =
        url.indexOf("http") === 0 ? url : window.location.origin + url;
      wrap.appendChild(
        h("section", { class: "jbt-card" }, [
          h("div", { class: "jbt-card__head" }, [
            h("h2", { class: "jbt-card__title", text: t("collect.linkReady") }),
          ]),
          h("div", { class: "jbt-card__body" }, [
            h("div", { class: "jbt-link" }, [
              h("span", { class: "jbt-link__value", text: absolute }),
              h(
                "button",
                {
                  class: "jbt-btn jbt-btn--primary",
                  type: "button",
                  onclick: function (event) {
                    var button = event.target;
                    navigator.clipboard.writeText(absolute).then(function () {
                      button.textContent = t("collect.copied");
                      window.setTimeout(function () {
                        button.textContent = t("collect.copy");
                      }, 1600);
                    });
                  },
                },
                [t("collect.copy")],
              ),
            ]),
          ]),
        ]),
      );
    } else if (state.data.settings.collectionUrl) {
      wrap.appendChild(
        h("p", { class: "jbt-field__hint", text: t("collect.noUrl") }),
      );
    }

    /* The shareable QR: print it for a counter, scan it from a phone. */
    if (url) {
      var absoluteQr =
        url.indexOf("http") === 0 ? url : window.location.origin + url;
      var qrWrap = h("div", { class: "jbt-card" }, []);
      var qrSection = h("section", {}, []);
      qrSection.appendChild(
        h("div", { class: "jbt-card__head" }, [
          h("h2", { class: "jbt-card__title", text: t("collect.qr.title") }),
        ]),
      );
      var qrBody = h("div", { class: "jbt-card__body" }, [
        h("p", { class: "jbt-field__hint", text: t("collect.qr.hint") }),
      ]);
      var qrImage = h("img", {
        class: "jbt-qr__image",
        alt: t("collect.qr.alt"),
      });
      try {
        var qrCode = window.qrcode(0, "M");
        qrCode.addData(absoluteQr);
        qrCode.make();
        /**
         * Draw through a canvas so the download is a real PNG: the library's
         * own data URL is a GIF, and a "Download PNG" that saves a GIF would
         * be a lie in the file name.
         */
        var cellSize = 4;
        var margin = 8;
        var size = qrCode.getModuleCount() * cellSize + margin * 2;
        var canvas = h("canvas", { width: size, height: size });
        var context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size, size);
        context.fillStyle = "#000000";
        context.translate(margin, margin);
        qrCode.renderTo2dContext(context, cellSize);
        qrImage.src = canvas.toDataURL("image/png");
      } catch (err) {
        /** A QR that cannot be drawn is a cosmetic loss, not an error. */
        qrImage.removeAttribute("src");
      }
      qrBody.appendChild(h("div", { class: "jbt-qr" }, [qrImage]));
      qrBody.appendChild(
        h("div", { class: "jbt-record__actions" }, [
          h(
            "a",
            {
              class: "jbt-btn jbt-btn--primary",
              href: qrImage.src || "",
              download: "brayne-reviews-qr.png",
            },
            [t("collect.qr.download")],
          ),
        ]),
      );
      qrSection.appendChild(qrBody);
      qrWrap.appendChild(qrSection);
      wrap.appendChild(qrWrap);
    }

    /* Invite one customer: on-demand email with their name in the link. */
    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", {
            class: "jbt-card__title",
            text: t("collect.invite.title"),
          }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          h("p", { class: "jbt-field__hint", text: t("collect.invite.hint") }),
          inviteField(
            "name",
            "collect.invite.name",
            "collect.invite.name.hint",
            80,
          ),
          inviteField(
            "email",
            "collect.invite.email",
            "collect.invite.email.hint",
            200,
          ),
          inviteField(
            "note",
            "collect.invite.note",
            "collect.invite.note.hint",
            300,
          ),
          h("div", { class: "jbt-record__actions" }, [
            h(
              "button",
              {
                class: "jbt-btn jbt-btn--primary",
                type: "button",
                disabled: state.inviteBusy ? "disabled" : null,
                onclick: function () {
                  sendInvitation();
                },
              },
              [t("collect.invite.send")],
            ),
          ]),
          state.inviteMessage
            ? h("p", {
                class: "jbt-field__hint",
                role: "status",
                text: state.inviteMessage,
              })
            : null,
        ]),
      ]),
    );

    /* Who was asked, and the re-send button for a gentle nudge. */
    var sent = Array.isArray(state.data.invitations)
      ? state.data.invitations
      : [];
    if (sent.length > 0) {
      var sentBody = h("div", { class: "jbt-card__body" }, []);
      sent.forEach(function (row) {
        sentBody.appendChild(
          h("div", { class: "jbt-invite-row" }, [
            h("span", { class: "jbt-invite-row__who" }, [
              h("span", {
                class: "jbt-record__name",
                text: row.name || row.email,
              }),
              h("span", {
                class: "jbt-record__meta",
                text: row.email + " \u00b7 " + friendlyDate(row.sentAt),
              }),
            ]),
            h(
              "button",
              {
                class: "jbt-btn jbt-btn--quiet",
                type: "button",
                onclick: function () {
                  resendInvitation(row);
                },
              },
              [t("collect.invite.resend")],
            ),
          ]),
        );
      });
      wrap.appendChild(
        h("section", { class: "jbt-card" }, [
          h("div", { class: "jbt-card__head" }, [
            h("h2", {
              class: "jbt-card__title",
              text: t("collect.invite.sent"),
            }),
          ]),
          sentBody,
        ]),
      );
    }

    /* Import: paste a CSV, every row lands pending. */
    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", {
            class: "jbt-card__title",
            text: t("collect.import.title"),
          }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          h("p", { class: "jbt-field__hint", text: t("collect.import.hint") }),
          h("div", { class: "jbt-field" }, [
            h("span", {
              class: "jbt-field__label",
              text: t("collect.import.paste"),
            }),
            importTextarea(),
          ]),
          h("label", { class: "jbt-checkrow" }, [
            importConsentBox(),
            h("span", { class: "jbt-checkrow__text" }, [
              h("span", {
                class: "jbt-checkrow__label",
                text: t("collect.import.consent"),
              }),
              h("span", {
                class: "jbt-checkrow__meta",
                text: t("collect.import.consent.hint"),
              }),
            ]),
          ]),
          h("div", { class: "jbt-record__actions" }, [
            h(
              "button",
              {
                class: "jbt-btn jbt-btn--primary",
                type: "button",
                disabled: state.importConsent ? null : "disabled",
                onclick: function () {
                  runImport();
                },
              },
              [t("collect.import.run")],
            ),
          ]),
          state.importResult ? importReport() : null,
        ]),
      ]),
    );

    return wrap;
  }

  /** One invite-form input, backed by `state.invite`, not the settings draft. */
  function inviteField(key, labelKey, hintKey, maxlength) {
    var input = h("input", { class: "jbt-input", maxlength: maxlength });
    input.value = String(state.invite[key] || "");
    input.addEventListener("input", function (event) {
      state.invite[key] = event.target.value;
    });
    return h("div", { class: "jbt-field" }, [
      h("label", { class: "jbt-field__label", text: t(labelKey) }),
      input,
      h("p", { class: "jbt-field__hint", text: t(hintKey) }),
    ]);
  }

  /** The pasted-CSV box, without re-rendering on every keystroke. */
  function importTextarea() {
    var area = h("textarea", { class: "jbt-input", rows: 6 });
    area.value = state.importText;
    area.addEventListener("input", function (event) {
      state.importText = event.target.value;
    });
    return area;
  }

  function importConsentBox() {
    var box = h("input", { type: "checkbox" });
    box.checked = state.importConsent;
    box.addEventListener("change", function (event) {
      state.importConsent = event.target.checked;
      render();
    });
    return box;
  }

  /** The import's per-row report, mirroring what the server answered. */
  function importReport() {
    var result = state.importResult;
    if (!result) return null;
    var lines = [
      t("collect.import.done").replace("{n}", String(result.imported)),
    ];
    (result.failed || []).forEach(function (failure) {
      lines.push(
        t("collect.import.failed")
          .replace("{row}", String(failure.row))
          .replace("{error}", String(failure.message)),
      );
    });
    return h("p", {
      class: "jbt-field__hint",
      role: "status",
      text: lines.join(" "),
    });
  }

  /**
   * Parse the pasted CSV, RFC 4180: quoted fields, doubled quotes, and
   * either the export's own header row or the plain positional columns
   * (quote, name, role, rating, consent).
   */
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') {
            cell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text.charAt(i + 1) === "\n") i += 1;
        row.push(cell);
        cell = "";
        if (row.length > 1 || row[0].trim() !== "") rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    return rows;
  }

  /** Turn parsed CSV rows into import row objects for the server. */
  function csvToRows(parsed) {
    if (parsed.length === 0) return [];
    var first = parsed[0].map(function (entry) {
      return String(entry).trim().toLowerCase();
    });
    var header = first.indexOf("quote") >= 0;
    var data = header ? parsed.slice(1) : parsed;
    var columns = header
      ? first
      : ["quote", "personname", "role", "rating", "consent"];
    return data
      .map(function (cells) {
        var row = {};
        columns.forEach(function (name, index) {
          var value = cells[index];
          if (value === undefined) return;
          if (name === "quote") row.quote = value;
          else if (name === "personname") row.personName = value;
          else if (name === "role") row.role = value;
          else if (name === "rating") {
            var parsedRating = String(value).trim();
            row.rating =
              parsedRating === "" ? null : Number.parseInt(parsedRating, 10);
          } else if (name === "locale") {
            row.locale = String(value).trim();
          }
        });
        return row;
      })
      .filter(function (row) {
        return (
          (typeof row.quote === "string" && row.quote.trim() !== "") ||
          (typeof row.personName === "string" && row.personName.trim() !== "")
        );
      })
      .map(function (row) {
        row.consent = true;
        return row;
      });
  }

  function sendInvitation() {
    state.inviteBusy = true;
    state.inviteMessage = "";
    render();
    send("POST", "/invite", state.invite).then(function (result) {
      state.inviteBusy = false;
      if (result.ok) {
        state.data = result.body;
        state.invite = { name: "", email: "", note: "" };
        state.inviteMessage = t("collect.invite.sentOk");
        render();
        return;
      }
      state.inviteMessage = result.body.error
        ? String(result.body.error)
        : t("save.failed");
      render();
    });
  }

  function resendInvitation(row) {
    send("POST", "/invite", {
      name: row.name || "",
      email: row.email,
      note: row.note || "",
    }).then(function (result) {
      if (result.ok) {
        state.data = result.body;
        state.inviteMessage = t("collect.invite.sentOk");
        render();
        return;
      }
      state.inviteMessage = result.body.error
        ? String(result.body.error)
        : t("save.failed");
      render();
    });
  }

  function runImport() {
    var parsed = parseCsv(state.importText);
    var rows = csvToRows(parsed);
    if (rows.length === 0) {
      state.importResult = { imported: 0, failed: [] };
      state.inviteMessage = "";
      render();
      return;
    }
    send("POST", "/import", { rows: rows }).then(function (result) {
      if (result.ok) {
        state.importResult = result.body;
        state.importText = "";
        state.importConsent = false;
        /** Refresh the inbox counts behind this screen. */
        return send("GET", "/admin-data").then(function (fresh) {
          if (fresh.ok) state.data = fresh.body;
          render();
        });
      }
      state.importResult = {
        imported: 0,
        failed: [{ row: 0, message: result.body.error || t("save.failed") }],
      };
      render();
    });
  }

  /* ------------------------------------------------------------- view state */

  function openView(view) {
    state.view = view;
    state.saveError = "";
    state.fieldErrors = {};
    if (view !== "editor") state.draft = null;
    if (view === "settings" || view === "collect") {
      state.settingsDraft = Object.assign({}, state.data.settings);
    }
    state.dirty = false;
    bridge.reportDirty(false);
    render();
  }

  /* ------------------------------------------------------------------ save */

  /** Client-side mirrors of the server rules, so bad values never leave. */
  function collectDraftErrors() {
    var errors = {};
    var draft = state.draft || {};
    if (!String(draft.quote || "").trim())
      errors.quote = t("editor.quote.required");
    if (!String(draft.personName || "").trim())
      errors.personName = t("editor.personName.required");
    if (draft.consent !== true) errors.consent = t("editor.consent.required");
    var avatar = String(draft.avatarUrl || "").trim();
    if (avatar && !/^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/.test(avatar)) {
      errors.avatarUrl = t("editor.avatarUrl.invalid");
    }
    var photo = String(draft.photoUrl || "").trim();
    if (photo && !/^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/.test(photo)) {
      errors.photoUrl = t("editor.photoUrl.invalid");
    }
    var video = String(draft.videoUrl || "").trim();
    if (video && !isKnownVideoUrl(video)) {
      errors.videoUrl = t("editor.videoUrl.invalid");
    }
    var locale = String(draft.locale || "").trim();
    if (
      locale &&
      !/^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-[A-Za-z]{2}|\d{3})?(?:-[A-Za-z0-9]{5,8})*$/.test(
        locale,
      )
    ) {
      errors.locale = t("editor.locale.invalid");
    }
    return errors;
  }

  /** The same hosts the server's allowlist takes, mirrored client-side. */
  function isKnownVideoUrl(raw) {
    return (
      /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}/.test(raw) ||
      /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{6,20}/.test(raw) ||
      /^https:\/\/vimeo\.com\/[0-9]{4,12}/.test(raw)
    );
  }

  function saveRecord() {
    if (state.saving) return;
    var clientErrors = collectDraftErrors();
    if (Object.keys(clientErrors).length > 0) {
      state.fieldErrors = clientErrors;
      state.saveError = t("save.failed");
      render();
      var first = document.querySelector(".jbt-input[aria-invalid='true']");
      if (first) first.focus();
      return;
    }

    state.saving = true;
    state.saveError = "";
    render();

    send("PUT", "/record", {
      id: state.draft.id || undefined,
      quote: state.draft.quote,
      personName: state.draft.personName,
      role: state.draft.role || "",
      rating: state.draft.rating === null ? "" : state.draft.rating,
      avatarUrl: state.draft.avatarUrl || "",
      photoUrl: state.draft.photoUrl || "",
      videoUrl: state.draft.videoUrl || "",
      tag: state.draft.tag || "",
      locale: state.draft.locale || "",
      ownerReply: state.draft.ownerReply || "",
      note: state.draft.note || "",
      verified: state.draft.verified === true,
      consent: state.draft.consent,
      status: state.draft.status || "pending",
      source: state.draft.source || "manual",
    }).then(function (result) {
      state.saving = false;
      if (result.ok) {
        state.data = result.body;
        state.draft = null;
        state.saved = true;
        state.savedKind = "Record";
        state.view = "inbox";
        clearDirty();
        render();
        return;
      }
      state.saveError = result.body.error
        ? String(result.body.error)
        : t("save.failed");
      if (result.body.field)
        state.fieldErrors[result.body.field] = state.saveError;
      render();
    });
  }

  function saveSettings() {
    if (state.saving) return;
    var draft = state.settingsDraft || {};
    var avatarRule = /^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/;
    var clientErrors = {};
    if (
      state.view === "collect" &&
      !avatarRule.test(String(draft.collectionUrl || "").trim())
    ) {
      clientErrors.collectionUrl = t("collect.url.invalid");
    }
    if (Object.keys(clientErrors).length > 0) {
      state.fieldErrors = clientErrors;
      state.saveError = t("save.failed");
      render();
      return;
    }

    state.saving = true;
    state.saveError = "";
    render();

    var payload = {};
    if (state.view === "collect") {
      payload.collectionUrl = String(draft.collectionUrl || "").trim();
    } else {
      payload.notifyEmail = String(draft.notifyEmail || "").trim();
      payload.requireCaptcha = draft.requireCaptcha === true;
      payload.minRatingToDisplay = Number(draft.minRatingToDisplay || 0);
    }

    send("PUT", "/admin-settings", payload).then(function (result) {
      state.saving = false;
      if (result.ok) {
        state.data = result.body;
        state.settingsDraft = Object.assign({}, result.body.settings);
        state.saved = true;
        state.savedKind = "Settings";
        state.view = state.view === "collect" ? "collect" : "settings";
        clearDirty();
        render();
        return;
      }
      state.saveError = result.body.error
        ? String(result.body.error)
        : t("save.failed");
      if (result.body.field)
        state.fieldErrors[result.body.field] = state.saveError;
      render();
    });
  }

  function moderate(id, action) {
    send("POST", "/moderate", { id: id, action: action }).then(
      function (result) {
        if (result.ok) {
          state.data = result.body;
          render();
          return;
        }
        state.saveError = result.body.error
          ? String(result.body.error)
          : t("load.failed");
        render();
      },
    );
  }

  /** One authorized JSON call to the plugin's own routes. */
  function send(method, path, body) {
    var token = readCsrfCookie();
    var attempt = token
      ? Promise.resolve(token)
      : fetch("/api/auth/csrf", { credentials: "same-origin" })
          .catch(function () {
            return null;
          })
          .then(function () {
            return readCsrfCookie();
          });

    return attempt.then(function (csrf) {
      return fetchJson(API_BASE + path, {
        method: method,
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf || "",
        },
        body: JSON.stringify(body),
      });
    });
  }

  /* --------------------------------------------------------------- catalog */

  function loadCatalog(context) {
    var catalogs = context && context.catalogs ? context.catalogs : null;
    var wanted = null;
    if (catalogs) {
      if (context.locale && catalogs[context.locale])
        wanted = catalogs[context.locale];
      if (!wanted) {
        var base = String(context.locale || "en").split("-")[0];
        if (catalogs[base]) wanted = catalogs[base];
      }
      if (!wanted && catalogs.en) wanted = catalogs.en;
    }
    if (!wanted) return Promise.resolve();
    return fetch(wanted, { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (body) {
        if (body && typeof body === "object") {
          state.catalog = Object.assign({}, FALLBACK, body);
          render();
        }
      })
      .catch(function () {
        /** A catalog that fails to load is a cosmetic loss, not an error. */
      });
  }

  /* --------------------------------------------------------------- theming */

  function applyTheme(theme) {
    var resolved = theme === "dark" || theme === "light" ? theme : "";
    state.theme = resolved;
    if (resolved) {
      document.documentElement.setAttribute("data-jbt-theme", resolved);
      return;
    }
    document.documentElement.removeAttribute("data-jbt-theme");
    if (window.matchMedia) {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      var sync = function () {
        if (state.theme) return;
        if (media.matches)
          document.documentElement.setAttribute("data-jbt-theme", "dark");
        else document.documentElement.removeAttribute("data-jbt-theme");
        render();
      };
      if (media.addEventListener) media.addEventListener("change", sync);
      sync();
    }
  }

  /* ------------------------------------------------------------------ boot */

  bridge.onContext(function (context) {
    state.locale = context.locale || "en";
    applyTheme(context.theme || "");
    loadCatalog(context).then(loadData).then(render);
  });

  bridge.autoResize();
  render();
  bridge.ready();
})();

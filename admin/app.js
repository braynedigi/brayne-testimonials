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
    "inbox.empty.title": "No testimonials yet",
    "inbox.empty.body": "Collect your first review, or add one manually.",
    "inbox.empty.collect": "Collect reviews",
    "inbox.empty.add": "Add one manually",
    "inbox.filtered.empty": "No reviews match this filter.",
    "record.pending": "Pending",
    "record.approved": "Published",
    "record.featured": "Featured",
    "record.hiddenByMinimum": "Hidden by your display minimum",
    "record.unrated": "No rating",
    "record.approve": "Approve",
    "record.unapprove": "Unpublish",
    "record.feature": "Feature",
    "record.unfeature": "Unfeature",
    "record.edit": "Edit",
    "record.delete": "Delete",
    "record.deleteConfirm": "Delete this review? This cannot be undone.",
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
    "editor.avatarUrl.invalid": "Enter an image address from this site, or leave it empty.",
    "editor.rating": "Star rating",
    "editor.rating.hint": "Optional. Unrated reviews show no stars.",
    "editor.rating.none": "No rating",
    "editor.consent": "Permission to publish",
    "editor.consent.hint": "You confirm the customer allowed these words to be shown.",
    "editor.consent.required": "Permission to publish is required.",
    "editor.status": "Status",
    "editor.status.pending": "Pending - hidden until approved",
    "editor.status.approved": "Published - visible on the site",
    "editor.save": "Save testimonial",
    "editor.cancel": "Cancel",
    "settings.title": "Settings",
    "settings.notifications": "Notifications",
    "settings.notifyEmail": "Notification email",
    "settings.notifyEmail.hint": "Where new submissions are announced. Empty sends no email.",
    "settings.notifyEmail.invalid": "Enter a valid email address, or leave it empty.",
    "settings.moderation": "Moderation",
    "settings.requireCaptcha": "Require CAPTCHA",
    "settings.requireCaptcha.hint":
      "Uses the site's own configured provider. Every submission is moderated either way.",
    "settings.noCaptcha":
      "The site has no CAPTCHA configured, so submissions rely on moderation alone.",
    "settings.display": "Display defaults",
    "settings.showStars": "Show star ratings",
    "settings.showStars.hint": "Unrated reviews render without stars.",
    "settings.showAvatars": "Show avatars",
    "settings.showAvatars.hint": "The reviewer's image, or a colour chip with their initials.",
    "settings.showDate": "Show review date",
    "settings.showDate.hint": "Displays when the review was approved.",
    "settings.defaultLayout": "Default layout",
    "settings.columns": "Grid columns",
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
      "Paste the page address below; the panel then offers a shareable link for email and social posts.",
    "collect.url": "Reviews page address",
    "collect.url.hint": "For example /reviews, or the full address.",
    "collect.url.invalid":
      "Enter the page address on this site (for example /reviews), or leave it empty.",
    "collect.copy": "Copy link",
    "collect.copied": "Link copied",
    "collect.saveUrl": "Save address",
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
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      var data = event.data;
      if (!data || data.source !== HOST_SOURCE) return;
      if (data.type === "context" && data.context && typeof data.context === "object") {
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
      el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
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
        h("span", { class: "jbt-star " + (index < rating ? "jbt-star--on" : "jbt-star--off") }, [
          "\u2605",
        ]),
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
    if (state.view === "settings" && state.settingsDraft) return state.settingsDraft[key];
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
    return message ? h("p", { class: "jbt-field__error", role: "alert", text: message }) : null;
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
      h("label", { class: "jbt-field__label", for: "jbt-field-" + key, text: t(labelKey) }),
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
      if (String(draftValue(key)) === String(choice.value)) option.selected = true;
      select.appendChild(option);
    });
    return h("div", { class: "jbt-field" }, [
      h("label", { class: "jbt-field__label", for: "jbt-field-" + key, text: t(labelKey) }),
      select,
      fieldError(key),
      hintKey ? h("p", { class: "jbt-field__hint", text: t(hintKey) }) : null,
    ]);
  }

  /* ------------------------------------------------------------- data load */

  function loadData() {
    return fetchJson(API_BASE + "/admin-data").then(function (result) {
      if (!result.ok) {
        state.loadError = result.status === 403 ? t("load.forbidden") : t("load.failed");
        state.data = null;
        return;
      }
      state.loadError = "";
      state.data = result.body;
      if (!state.draft) state.draft = null;
      if (!state.settingsDraft) state.settingsDraft = Object.assign({}, result.body.settings);
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
      root.appendChild(h("div", { class: "jbt-skeleton", "aria-hidden": "true" }));
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
            (gold ? " jbt-stat__value--gold" : value === null ? " jbt-stat__value--muted" : ""),
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
            h("p", { class: "jbt-banner__body", text: t("banner.pending.body") }),
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
      all: records.length,
      pending: stats.pending,
      approved: stats.approved,
      featured: stats.featured,
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
      return true;
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
      wrap.appendChild(h("p", { class: "jbt-field__hint", text: t("inbox.filtered.empty") }));
      return wrap;
    }

    visible.forEach(function (record) {
      wrap.appendChild(recordCard(record));
    });

    return wrap;
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
            (record.status === "approved" ? "jbt-pill--success" : "jbt-pill--warning"),
        },
        [
          h("span", { class: "jbt-dot" }),
          t(record.status === "approved" ? "record.approved" : "record.pending"),
        ],
      ),
    );
    if (record.featuredAt) {
      pills.appendChild(h("span", { class: "jbt-pill" }, ["\u2605 " + t("record.featured")]));
    }
    if (min >= 1 && record.rating === null && record.status === "approved") {
      pills.appendChild(
        h("span", { class: "jbt-pill jbt-pill--muted" }, [t("record.hiddenByMinimum")]),
      );
    }

    var actions = h("div", { class: "jbt-record__actions" }, []);
    actions.appendChild(
      h(
        "button",
        {
          class:
            "jbt-btn " + (record.status === "approved" ? "jbt-btn--quiet" : "jbt-btn--primary"),
          type: "button",
          onclick: function () {
            moderate(record.id, record.status === "approved" ? "unapprove" : "approve");
          },
        },
        [t(record.status === "approved" ? "record.unapprove" : "record.approve")],
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
            if (window.confirm(t("record.deleteConfirm"))) moderate(record.id, "delete");
          },
        },
        [t("record.delete")],
      ),
    );

    return h("article", { class: "jbt-record" }, [
      h("div", { class: "jbt-record__top" }, [
        h("div", { class: "jbt-record__who" }, [
          h("div", { class: "jbt-record__name", text: record.personName }),
          record.role ? h("div", { class: "jbt-record__role", text: record.role }) : null,
        ]),
        pills,
      ]),
      starRow(record.rating),
      h("blockquote", { class: "jbt-record__quote", text: record.quote }),
      h("div", { class: "jbt-record__meta" }, [
        t("date.submitted") + " " + friendlyDate(record.submittedAt),
        record.approvedAt
          ? " \u00b7 " + t("date.approved") + " " + friendlyDate(record.approvedAt)
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
          labeledInput("personName", "editor.personName", "editor.personName.hint", {
            maxlength: 60,
          }),
          labeledInput("role", "editor.role", "editor.role.hint", { maxlength: 80 }),
          labeledInput("avatarUrl", "editor.avatarUrl", "editor.avatarUrl.hint", {
            maxlength: 500,
          }),
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
          h("h2", { class: "jbt-card__title", text: t("settings.notifications") }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          labeledInput("notifyEmail", "settings.notifyEmail", "settings.notifyEmail.hint", {
            maxlength: 200,
          }),
        ]),
      ]),
    );

    wrap.appendChild(
      h("section", { class: "jbt-card" }, [
        h("div", { class: "jbt-card__head" }, [
          h("h2", { class: "jbt-card__title", text: t("settings.moderation") }),
        ]),
        h("div", { class: "jbt-card__body" }, [
          checkrowNode("requireCaptcha", "settings.requireCaptcha", "settings.requireCaptcha.hint"),
          noCaptcha
            ? h("div", { class: "jbt-banner jbt-banner--info", role: "status" }, [
                h("div", { class: "jbt-banner__text" }, [
                  h("p", { class: "jbt-banner__title", text: t("settings.noCaptcha") }),
                ]),
              ])
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
          checkrowNode("showStars", "settings.showStars", "settings.showStars.hint"),
          checkrowNode("showAvatars", "settings.showAvatars", "settings.showAvatars.hint"),
          checkrowNode("showDate", "settings.showDate", "settings.showDate.hint"),
          labeledSelect("defaultLayout", "settings.defaultLayout", null, [
            { value: "grid", label: "Grid" },
            { value: "slider", label: "Slider" },
            { value: "feature", label: "Feature quote" },
          ]),
          labeledSelect("columns", "settings.columns", null, [
            { value: "2", label: "Two" },
            { value: "3", label: "Three" },
            { value: "4", label: "Four" },
          ]),
          labeledSelect("minRatingToDisplay", "settings.minRating", "settings.minRating.hint", [
            { value: "0", label: "No minimum" },
            { value: "1", label: "1 star and above" },
            { value: "2", label: "2 stars and above" },
            { value: "3", label: "3 stars and above" },
            { value: "4", label: "4 stars and above" },
            { value: "5", label: "5 stars only" },
          ]),
        ]),
      ]),
    );

    return wrap;
  }

  /* --------------------------------------------------------------- collect */

  function renderCollect() {
    var wrap = h("div", { class: "jbt-view" }, []);
    var url = state.settingsDraft ? String(state.settingsDraft.collectionUrl || "") : "";

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
          h("div", { class: "jbt-record__actions" }, [saveButton("collect.saveUrl")]),
        ]),
      ]),
    );

    if (url) {
      var absolute = url.indexOf("http") === 0 ? url : window.location.origin + url;
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
      wrap.appendChild(h("p", { class: "jbt-field__hint", text: t("collect.noUrl") }));
    }

    return wrap;
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
    if (!String(draft.quote || "").trim()) errors.quote = t("editor.quote.required");
    if (!String(draft.personName || "").trim()) errors.personName = t("editor.personName.required");
    if (draft.consent !== true) errors.consent = t("editor.consent.required");
    var avatar = String(draft.avatarUrl || "").trim();
    if (avatar && !/^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/.test(avatar)) {
      errors.avatarUrl = t("editor.avatarUrl.invalid");
    }
    return errors;
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
      state.saveError = result.body.error ? String(result.body.error) : t("save.failed");
      if (result.body.field) state.fieldErrors[result.body.field] = state.saveError;
      render();
    });
  }

  function saveSettings() {
    if (state.saving) return;
    var draft = state.settingsDraft || {};
    var avatarRule = /^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*)$/;
    var clientErrors = {};
    if (state.view === "collect" && !avatarRule.test(String(draft.collectionUrl || "").trim())) {
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
      payload.showStars = draft.showStars === true;
      payload.showAvatars = draft.showAvatars === true;
      payload.showDate = draft.showDate === true;
      payload.defaultLayout = draft.defaultLayout || "grid";
      payload.columns = draft.columns || "3";
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
      state.saveError = result.body.error ? String(result.body.error) : t("save.failed");
      if (result.body.field) state.fieldErrors[result.body.field] = state.saveError;
      render();
    });
  }

  function moderate(id, action) {
    send("POST", "/moderate", { id: id, action: action }).then(function (result) {
      if (result.ok) {
        state.data = result.body;
        render();
        return;
      }
      state.saveError = result.body.error ? String(result.body.error) : t("load.failed");
      render();
    });
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
      if (context.locale && catalogs[context.locale]) wanted = catalogs[context.locale];
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
        if (media.matches) document.documentElement.setAttribute("data-jbt-theme", "dark");
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

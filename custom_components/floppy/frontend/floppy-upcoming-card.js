// Floppy Upcoming Card - shows upcoming episodes from a Floppy media server.
// Reads sensor.floppy_upcoming_* entities provided by the Floppy integration.

if (!customElements.get("ha-panel-lovelace")) {
  await customElements.whenDefined("ha-panel-lovelace");
}
const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const WEEKDAYS = {
  da: ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};
const MONTHS = {
  da: [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};
const MODE_LABELS = {
  all: "All",
  in_progress: "In progress",
  not_caught_up: "Not caught up",
  planning: "Planning",
  paused: "Paused",
  completed: "Completed",
  dropped: "Dropped",
};

class FloppyUpcomingCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  static getConfigElement() {
    return document.createElement("floppy-upcoming-card-editor");
  }

  static getStubConfig() {
    return { mode: "all", layout: "grouped", columns: 3, lang: "auto" };
  }

  setConfig(config) {
    if (!config || config.type !== "floppy-upcoming-card") {
      throw new Error("Invalid configuration for floppy-upcoming-card");
    }
    this.config = config;
  }

  get _mode() {
    return this.config.mode || "all";
  }

  get _entity() {
    if (this.config.entity) return this.config.entity;
    return `sensor.floppy_upcoming_${this._mode}`;
  }

  get _langMode() {
    const lang = this.config.lang || "auto";
    if (lang !== "auto") return lang;
    const haLang = (this.hass && this.hass.locale && this.hass.locale.language) || "en";
    return haLang.startsWith("da") ? "da" : "en";
  }

  get _lang() {
    return this._langMode;
  }

  get _title() {
    return this.config.title || "Kommende serier";
  }

  get _columns() {
    const cols = Number(this.config.columns);
    if (!Number.isFinite(cols) || cols < 1) return 3;
    return Math.min(cols, 4);
  }

  get _maxEpisodes() {
    const max = Number(this.config.max_episodes);
    return Number.isFinite(max) && max > 0 ? max : 0;
  }

  get _showImages() {
    return this.config.show_images !== false;
  }

  get _imageSize() {
    const size = Number(this.config.image_size);
    return Number.isFinite(size) && size > 0 ? size : 52;
  }

  get _showDates() {
    return this.config.show_dates !== false;
  }

  get _showDateHeader() {
    return this.config.show_date_header !== false;
  }

  get _hideWhenEmpty() {
    return this.config.hide_when_empty === true;
  }

  get _flatten() {
    return (this.config.layout || "grouped") === "list";
  }

  _episodeState() {
    const state = this.hass && this.hass.states ? this.hass.states[this._entity] : undefined;
    if (!state) return null;
    const attrs = state.attributes || {};
    return {
      count: state.state,
      results: Array.isArray(attrs.results) ? attrs.results : [],
      source: attrs.source,
      updated: attrs.updated,
    };
  }

  _imgUrl(url) {
    if (!url) return "";
    const soon = (w) => url.replace(/\/w\d+\//, `/w${w}/`);
    return soon(this._imageSize < 100 ? 154 : this._imageSize < 250 ? 342 : 500);
  }

  _relativeLabel(dateStr) {
    const lang = this._lang;
    const today = this._todayKey();
    const days = this._dayDiff(today, dateStr);
    if (days === 0) return lang === "da" ? "I dag" : "Today";
    if (days === 1) return lang === "da" ? "I morgen" : "Tomorrow";
    if (days > 1) return lang === "da" ? `Om ${days} dage` : `In ${days} days`;
    return lang === "da" ? "Tidligere" : "Earlier";
  }

  _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  _dayDiff(fromKey, toKey) {
    const a = new Date(fromKey + "T00:00:00");
    const b = new Date(toKey + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  _dateHeader(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const lang = this._lang;
    return lang === "da"
      ? `${WEEKDAYS.da[dt.getDay()]} ${d}. ${MONTHS.da[m - 1]}`
      : `${WEEKDAYS.en[dt.getDay()]} ${MONTHS.en[m - 1]} ${d}`;
  }

  _todayHeader() {
    const lang = this._lang;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    if (lang === "da") {
      return `I dag er det ${WEEKDAYS.da[now.getDay()]} ${now.getDate()}. ${MONTHS.da[now.getMonth()]} ${now.getFullYear()} · kl. ${hh}:${mm}`;
    }
    return `Today is ${WEEKDAYS.en[now.getDay()]} ${MONTHS.en[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} · ${hh}:${mm}`;
  }

  _cappedResults() {
    const data = this._episodeState();
    if (!data) return [];
    const max = this._maxEpisodes;
    return max > 0 ? data.results.slice(0, max) : data.results;
  }

  _groupedDates(episodes) {
    const map = new Map();
    for (const ep of episodes) {
      const key = ep.date || (ep.datetime || "").slice(0, 10);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ep);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  _chunkDates(dates, cols) {
    const out = [];
    for (let i = 0; i < cols; i++) out.push([]);
    dates.forEach((entry, idx) => out[idx % cols].push(entry));
    return out;
  }

  _seasonEpText(ep) {
    const lang = this._lang;
    const s = ep.season != null ? ep.season : "";
    const e = ep.episode != null ? ep.episode : "";
    if (lang === "da") {
      return `Sæson ${s} · Episode ${e}`;
    }
    return `Season ${s} · Episode ${e}`;
  }

  _episodeRow(ep) {
    const showImages = this._showImages;
    const showDates = this._showDates;
    const title = ep.title || "";
    const url = ep.url || "";
    const inner = [];
    if (showImages && ep.image) {
      inner.push(html`
        <img class="poster" alt="" loading="lazy"
             style="width:${this._imageSize}px;height:${Math.round(this._imageSize * 1.5)}px"
             src="${this._imgUrl(ep.image)}" @error=${(ev) => this._imgError(ev)} />
      `);
    }
    const meta = [this._seasonEpText(ep)];
    if (showDates && this._flatten && ep.date) {
      meta.push(this._dateHeader(ep.date));
    }
    inner.push(html`
      <div class="ep-meta">
        <span class="ep-title">${title}</span>
        <span class="ep-sub">${meta.join(" · ")}</span>
      </div>
    `);
    return url
      ? html`<a class="row" href="${url}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : html`<div class="row">${inner}</div>`;
  }

  _imgError(ev) {
    ev.target.style.display = "none";
  }

  _renderGrouped() {
    const episodes = this._cappedResults();
    const dates = this._groupedDates(episodes);
    if (!dates.length) return this._renderEmpty();
    const chunks = this._chunkDates(dates, this._columns);
    const cols = chunks
      .filter((c) => c.length)
      .map(
        (chunk) => html`
          <div class="col">
            ${chunk.map(([dateKey, eps]) => html`
              ${this._showDates ? html`
                <h2 class="day-head">${this._dateHeader(dateKey)}
                  <span class="day-rel">${this._relativeLabel(dateKey)}</span>
                </h2>
              ` : ""}
              ${eps.map((ep) => this._episodeRow(ep))}
            `)}
          </div>
        `
      );
    return html`
      <div class="grid" style="--floppy-cols:${this._columns}">${cols}</div>
    `;
  }

  _renderList() {
    const episodes = this._cappedResults();
    if (!episodes.length) return this._renderEmpty();
    return html`<div class="list">${episodes.map((ep) => this._episodeRow(ep))}</div>`;
  }

  _renderEmpty() {
    if (this._hideWhenEmpty) return html``;
    const lang = this._lang;
    const text = lang === "da" ? "Ingen kommende episoder" : "No upcoming episodes";
    return html`<div class="empty">${text}</div>`;
  }

  _renderError() {
    if (this._hideWhenEmpty) return html``;
    const lang = this._lang;
    const text =
      lang === "da"
        ? "Floppy-integrationen er ikke konfigureret. Tilføj den under Indstillinger → Enheder & tjenester."
        : "The Floppy integration is not configured. Add it under Settings → Devices & services.";
    return html`<div class="error"><ha-icon icon="mdi:floppy"></ha-icon>${text}</div>`;
  }

  _renderStale() {
    const data = this._episodeState();
    if (!data || !data.source) return "";
    const lang = this._lang;
    if (data.source === "cache") {
      return html`
        <div class="footnote">${lang === "da" ? "Cachelagte data (Floppy utilgængelig)" : "Cached data (Floppy unavailable)"}</div>
      `;
    }
    return "";
  }

  render() {
    if (!this.config) return html``;
    const data = this._episodeState();
    if (!data) return html`<ha-card>${this._renderError()}</ha-card>`;

    const countText =
      this._lang === "da"
        ? `${data.count} episoder · ${MODE_LABELS[this._mode] || this._mode}`
        : `${data.count} episodes · ${MODE_LABELS[this._mode] || this._mode}`;

    const body = this._flatten ? this._renderList() : this._renderGrouped();

    return html`
      <ha-card>
        <div class="header">
          <div class="title">${this._title}</div>
          ${this._showDateHeader ? html`<div class="today">${this._todayHeader()}</div>` : ""}
          <div class="count">${countText}</div>
        </div>
        ${body}
        ${this._renderStale()}
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      :host {
        --floppy-accent: var(--primary-color, #03a9f4);
      }
      .header {
        padding: 16px 16px 8px 16px;
        border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      }
      .title {
        font-weight: 600;
        font-size: 1.2em;
        color: var(--primary-text-color, #212121);
      }
      .today {
        margin-top: 4px;
        color: var(--secondary-text-color, #727272);
        font-size: 0.95em;
      }
      .count {
        margin-top: 2px;
        color: var(--secondary-text-color, #727272);
        font-size: 0.85em;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(var(--floppy-cols, 3), minmax(0, 1fr));
        gap: 0;
      }
      .col {
        padding: 8px 16px;
        border-left: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        min-width: 0;
      }
      .col:first-child {
        border-left: none;
      }
      .list {
        padding: 8px 16px;
      }
      .day-head {
        margin: 12px 0 6px 0;
        font-size: 0.95em;
        font-weight: 600;
        color: var(--primary-text-color, #212121);
      }
      .day-rel {
        margin-left: 8px;
        font-weight: 500;
        font-size: 0.78em;
        text-transform: uppercase;
        color: var(--floppy-accent);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        text-decoration: none;
        color: inherit;
      }
      .row:hover .ep-title {
        color: var(--floppy-accent);
      }
      .poster {
        border-radius: 4px;
        object-fit: cover;
        flex-shrink: 0;
        background: var(--secondary-background-color, #e0e0e0);
      }
      .ep-meta {
        min-width: 0;
        line-height: 1.3;
      }
      .ep-title {
        display: block;
        font-weight: 500;
        color: var(--primary-text-color, #212121);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ep-sub {
        display: block;
        font-size: 0.8em;
        color: var(--secondary-text-color, #727272);
      }
      .empty,
      .error {
        padding: 24px 16px;
        text-align: center;
        color: var(--secondary-text-color, #727272);
      }
      .error ha-icon {
        color: var(--error-color, #f44336);
        margin-right: 6px;
      }
      .footnote {
        padding: 6px 16px 10px 16px;
        font-size: 0.75em;
        color: var(--warning-color, #f9a825);
      }
      @media (max-width: 700px) {
        .grid {
          grid-template-columns: 1fr !important;
        }
        .col {
          border-left: none;
        }
      }
    `;
  }
}

customElements.define("floppy-upcoming-card", FloppyUpcomingCard);

const CONFIG_SCHEMA = [
  {
    name: "mode",
    selector: {
      select: {
        mode: "dropdown",
        options: Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })),
      },
    },
  },
  {
    name: "layout",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "grouped", label: "Grouped by date" },
          { value: "list", label: "Flat list" },
        ],
      },
    },
  },
  { name: "entity", selector: { entity: { domain: "sensor" } } },
  {
    name: "title",
    selector: { text: { multiline: false } },
  },
  {
    name: "columns",
    selector: { number: { min: 1, max: 4, mode: "box" } },
  },
  {
    name: "max_episodes",
    selector: { number: { min: 1, max: 200, mode: "box" } },
  },
  {
    name: "show_images",
    selector: { boolean: {} },
  },
  {
    name: "image_size",
    selector: { number: { min: 36, max: 120, mode: "slider" } },
  },
  {
    name: "show_dates",
    selector: { boolean: {} },
  },
  {
    name: "show_date_header",
    selector: { boolean: {} },
  },
  {
    name: "lang",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "auto", label: "Automatic (from Home Assistant)" },
          { value: "da", label: "Dansk" },
          { value: "en", label: "English" },
        ],
      },
    },
  },
  {
    name: "hide_when_empty",
    selector: { boolean: {} },
  },
];

class FloppyUpcomingCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  setConfig(config) {
    this.config = config;
  }

  _valueChanged(ev) {
    const value = ev.detail.value;
    const config = { ...this.config, ...value };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.config || !this.hass) return html``;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${CONFIG_SCHEMA}
        .computeLabel=${(s) => s.label || s.name}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

customElements.define("floppy-upcoming-card-editor", FloppyUpcomingCardEditor);
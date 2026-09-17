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

// JS Date.getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
const WEEKDAYS = {
  da: ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
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
  all: { da: "Alle", en: "All" },
  in_progress: { da: "I gang", en: "In progress" },
  not_caught_up: { da: "Ikke ajour", en: "Not caught up" },
  planning: { da: "Planlagt", en: "Planning" },
  paused: { da: "Pauset", en: "Paused" },
  completed: { da: "Færdig", en: "Completed" },
  dropped: { da: "Droppet", en: "Dropped" },
};

const PERIOD_LABELS = {
  today: { da: "I dag", en: "Today" },
  week: { da: "7 dage", en: "7 days" },
  month: { da: "30 dage", en: "30 days" },
  all: { da: "Alle", en: "All" },
};

const LAYOUT_LABELS = {
  grouped: { da: "Dato-grupperet", en: "Grouped by date" },
  list: { da: "Liste", en: "Flat list" },
  series: { da: "Pr. serie", en: "By series" },
};

class FloppyUpcomingCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _activeMode: { type: String },
      _activePeriod: { type: String },
      _activeLayout: { type: String },
      _selectedEpisode: { type: Object },
      _cardWidth: { type: Number },
    };
  }

  static getConfigElement() {
    return document.createElement("floppy-upcoming-card-editor");
  }

  static getStubConfig() {
    return {
      mode: "all",
      period: "all",
      layout: "grouped",
      columns: 3,
      lang: "auto",
      show_filter: true,
      show_period: true,
      show_layout: true,
      show_images: true,
      show_dates: true,
      show_date_header: true,
      max_episodes: 0,
    };
  }

  constructor() {
    super();
    this._resizeObserver = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this._cardWidth = entry.contentRect.width;
      }
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  setConfig(config) {
    if (!config || config.type !== "custom:floppy-upcoming-card") {
      throw new Error("Invalid configuration for floppy-upcoming-card");
    }
    this.config = config;
    this._activeMode = config.mode || "all";
    this._activePeriod = config.period || "all";
    this._activeLayout = config.layout || "grouped";
  }

  get _entity() {
    if (this.config.entity) return this.config.entity;
    const mode = this._activeMode;
    return `sensor.floppy_upcoming_${mode === "all" ? "episodes" : mode}`;
  }

  get _lang() {
    const lang = this.config.lang || "auto";
    if (lang !== "auto") return lang;
    const haLang = (this.hass && this.hass.locale && this.hass.locale.language) || "en";
    return haLang.startsWith("da") ? "da" : "en";
  }

  get _title() {
    return this.config.title || "Floppy";
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

  get _showFilter() {
    return this.config.show_filter !== false;
  }

  get _showPeriod() {
    return this.config.show_period !== false;
  }

  get _showLayout() {
    return this.config.show_layout !== false;
  }

  get _effectiveColumns() {
    // Responsive: adjust columns based on card width
    if (this._cardWidth) {
      if (this._cardWidth < 400) return 1;
      if (this._cardWidth < 700) return 2;
    }
    return this._columns;
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
      connection_status: attrs.connection_status || (attrs.source === "cache" ? "offline" : "online"),
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
    // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
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

  _filterByPeriod(episodes) {
    const period = this._activePeriod;
    if (period === "all") return episodes;
    const now = new Date();
    const today = this._todayKey();
    const maxDays = period === "today" ? 0 : period === "week" ? 7 : 30;
    return episodes.filter((ep) => {
      const days = this._dayDiff(today, ep.date);
      return days >= 0 && days <= maxDays;
    });
  }

  _cappedResults() {
    const data = this._episodeState();
    if (!data) return [];
    let episodes = data.results;
    episodes = this._filterByPeriod(episodes);
    const max = this._maxEpisodes;
    return max > 0 ? episodes.slice(0, max) : episodes;
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

  _groupedBySeries(episodes) {
    const map = new Map();
    for (const ep of episodes) {
      const key = `${ep.title}|${ep.media_id}`;
      if (!map.has(key)) map.set(key, { title: ep.title, media_id: ep.media_id, image: ep.image, episodes: [] });
      map.get(key).episodes.push(ep);
    }
    return [...map.values()].sort((a, b) => {
      const aMin = Math.min(...a.episodes.map((e) => e.date));
      const bMin = Math.min(...b.episodes.map((e) => e.date));
      return aMin.localeCompare(bMin);
    });
  }

  _chunkDates(dates, cols) {
    // Preserve chronological order: fill column by column, not row by row
    const out = [];
    for (let i = 0; i < cols; i++) out.push([]);
    const perCol = Math.ceil(dates.length / cols);
    dates.forEach((entry, idx) => {
      const col = Math.floor(idx / perCol);
      out[col].push(entry);
    });
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
    if (showDates && ep.date) {
      meta.push(this._dateHeader(ep.date));
    }
    inner.push(html`
      <div class="ep-meta">
        <span class="ep-title">${title}</span>
        <span class="ep-sub">${meta.join(" · ")}</span>
      </div>
    `);
    return html`
      <div class="row" @click=${() => this._showDetails(ep)}>
        ${url ? html`<a class="row-link" href="${url}" target="_blank" rel="noopener noreferrer" @click=${(e) => e.stopPropagation()}></a>` : ""}
        ${inner}
      </div>
    `;
  }

  _showDetails(ep) {
    this._selectedEpisode = ep;
  }

  _closeDetails() {
    this._selectedEpisode = null;
  }

  _imgError(ev) {
    ev.target.style.display = "none";
  }

  _setMode(mode) {
    this._activeMode = mode;
  }

  _setPeriod(period) {
    this._activePeriod = period;
  }

  _setLayout(layout) {
    this._activeLayout = layout;
  }

  _renderFilterButtons() {
    if (!this._showFilter) return "";
    const lang = this._lang;
    const modes = ["all", "in_progress", "not_caught_up", "planning"];
    return html`
      <div class="filter-row">
        ${modes.map((mode) => html`
          <button class="filter-btn ${this._activeMode === mode ? "active" : ""}"
                  @click=${() => this._setMode(mode)}>
            ${MODE_LABELS[mode][lang]}
          </button>
        `)}
      </div>
    `;
  }

  _renderPeriodButtons() {
    if (!this._showPeriod) return "";
    const lang = this._lang;
    const periods = ["today", "week", "month", "all"];
    return html`
      <div class="filter-row">
        ${periods.map((period) => html`
          <button class="filter-btn ${this._activePeriod === period ? "active" : ""}"
                  @click=${() => this._setPeriod(period)}>
            ${PERIOD_LABELS[period][lang]}
          </button>
        `)}
      </div>
    `;
  }

  _renderLayoutButtons() {
    if (!this._showLayout) return "";
    const lang = this._lang;
    const layouts = ["grouped", "list", "series"];
    return html`
      <div class="filter-row">
        ${layouts.map((layout) => html`
          <button class="filter-btn ${this._activeLayout === layout ? "active" : ""}"
                  @click=${() => this._setLayout(layout)}>
            ${LAYOUT_LABELS[layout][lang]}
          </button>
        `)}
      </div>
    `;
  }

  _renderGrouped() {
    const episodes = this._cappedResults();
    const dates = this._groupedDates(episodes);
    if (!dates.length) return this._renderEmpty();
    const cols = this._chunkDates(dates, this._effectiveColumns);
    const colEls = cols
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
      <div class="grid" style="--floppy-cols:${this._effectiveColumns}">${colEls}</div>
    `;
  }

  _renderList() {
    const episodes = this._cappedResults();
    if (!episodes.length) return this._renderEmpty();
    return html`<div class="list">${episodes.map((ep) => this._episodeRow(ep))}</div>`;
  }

  _renderSeries() {
    const episodes = this._cappedResults();
    const series = this._groupedBySeries(episodes);
    if (!series.length) return this._renderEmpty();
    return html`
      <div class="series-list">
        ${series.map((s) => html`
          <div class="series-item">
            ${this._showImages && s.image ? html`
              <img class="series-poster" alt="" loading="lazy"
                   style="width:${this._imageSize}px;height:${Math.round(this._imageSize * 1.5)}px"
                   src="${this._imgUrl(s.image)}" @error=${(ev) => this._imgError(ev)} />
            ` : ""}
            <div class="series-info">
              <div class="series-title">${s.title}</div>
              <div class="series-eps">
                ${s.episodes.map((ep) => html`
                  <div class="series-ep-row" @click=${() => this._showDetails(ep)}>
                    <span class="series-ep-text">${this._seasonEpText(ep)}</span>
                    ${this._showDates ? html`<span class="series-ep-date">${this._dateHeader(ep.date)}</span>` : ""}
                  </div>
                `)}
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
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
    return html`<div class="error"><ha-icon icon="mdi:alert-circle"></ha-icon>${text}</div>`;
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

  _renderDetailsDialog() {
    const ep = this._selectedEpisode;
    if (!ep) return "";
    const lang = this._lang;
    return html`
      <ha-dialog open @closed=${this._closeDetails} .heading=${ep.title}>
        <div class="dialog-content">
          ${ep.image ? html`
            <img class="dialog-poster" src="${this._imgUrl(ep.image)}" alt="${ep.title}" />
          ` : ""}
          <div class="dialog-info">
            <div class="dialog-title">${ep.title}</div>
            <div class="dialog-meta">${this._seasonEpText(ep)}</div>
            ${ep.date ? html`<div class="dialog-date">${this._dateHeader(ep.date)} · ${this._relativeLabel(ep.date)}</div>` : ""}
            ${ep.synopsis ? html`<div class="dialog-synopsis">${ep.synopsis}</div>` : ""}
          </div>
        </div>
        <mwc-button slot="primaryAction" @click=${this._closeDetails}>
          ${lang === "da" ? "Luk" : "Close"}
        </mwc-button>
        ${ep.url ? html`
          <a href="${ep.url}" target="_blank" rel="noopener noreferrer" slot="secondaryAction">
            <mwc-button>${lang === "da" ? "Åbn i Floppy" : "Open in Floppy"}</mwc-button>
          </a>
        ` : ""}
      </ha-dialog>
    `;
  }

  render() {
    if (!this.config) return html``;
    const data = this._episodeState();
    if (!data) return html`<ha-card>${this._renderError()}</ha-card>`;

    const lang = this._lang;
    const countText =
      lang === "da"
        ? `${data.count} episoder · ${MODE_LABELS[this._activeMode][lang]}`
        : `${data.count} episodes · ${MODE_LABELS[this._activeMode][lang]}`;

    let body;
    if (this._activeLayout === "list") {
      body = this._renderList();
    } else if (this._activeLayout === "series") {
      body = this._renderSeries();
    } else {
      body = this._renderGrouped();
    }

    return html`
      <ha-card>
        <div class="header">
          <div class="title">${this._title}</div>
          ${this._showDateHeader ? html`<div class="today">${this._todayHeader()}</div>` : ""}
          <div class="count">${countText}</div>
        </div>
        ${this._renderFilterButtons()}
        ${this._renderPeriodButtons()}
        ${this._renderLayoutButtons()}
        ${body}
        ${this._renderStale()}
        ${this._renderDetailsDialog()}
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
      .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      }
      .filter-btn {
        background: var(--secondary-background-color, #f5f5f5);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 16px;
        padding: 6px 12px;
        font-size: 0.85em;
        cursor: pointer;
        color: var(--primary-text-color, #212121);
        transition: all 0.2s;
      }
      .filter-btn:hover {
        background: var(--primary-color, #03a9f4);
        color: white;
      }
      .filter-btn.active {
        background: var(--primary-color, #03a9f4);
        color: white;
        border-color: var(--primary-color, #03a9f4);
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
      .series-list {
        padding: 8px 16px;
      }
      .series-item {
        display: flex;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      }
      .series-item:last-child {
        border-bottom: none;
      }
      .series-poster {
        border-radius: 4px;
        object-fit: cover;
        flex-shrink: 0;
        background: var(--secondary-background-color, #e0e0e0);
      }
      .series-info {
        flex: 1;
        min-width: 0;
      }
      .series-title {
        font-weight: 600;
        font-size: 1.05em;
        color: var(--primary-text-color, #212121);
        margin-bottom: 6px;
      }
      .series-eps {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .series-ep-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .series-ep-row:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }
      .series-ep-text {
        font-size: 0.9em;
        color: var(--primary-text-color, #212121);
      }
      .series-ep-date {
        font-size: 0.8em;
        color: var(--secondary-text-color, #727272);
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
        cursor: pointer;
        position: relative;
      }
      .row:hover .ep-title {
        color: var(--floppy-accent);
      }
      .row-link {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1;
      }
      .ep-meta {
        min-width: 0;
        line-height: 1.3;
        position: relative;
        z-index: 2;
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
      .poster {
        border-radius: 4px;
        object-fit: cover;
        flex-shrink: 0;
        background: var(--secondary-background-color, #e0e0e0);
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
      .dialog-content {
        display: flex;
        gap: 16px;
        padding: 16px;
      }
      .dialog-poster {
        width: 154px;
        height: 231px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .dialog-info {
        flex: 1;
        min-width: 0;
      }
      .dialog-title {
        font-size: 1.3em;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .dialog-meta {
        font-size: 1em;
        color: var(--secondary-text-color, #727272);
        margin-bottom: 8px;
      }
      .dialog-date {
        font-size: 0.95em;
        color: var(--primary-color, #03a9f4);
        margin-bottom: 12px;
      }
      .dialog-synopsis {
        font-size: 0.9em;
        line-height: 1.5;
        color: var(--primary-text-color, #212121);
      }
      @media (max-width: 700px) {
        .grid {
          grid-template-columns: 1fr !important;
        }
        .col {
          border-left: none;
        }
        .dialog-content {
          flex-direction: column;
        }
        .dialog-poster {
          width: 100%;
          height: auto;
          max-height: 300px;
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
        options: Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label: label.da })),
      },
    },
  },
  {
    name: "period",
    selector: {
      select: {
        mode: "dropdown",
        options: Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label: label.da })),
      },
    },
  },
  {
    name: "layout",
    selector: {
      select: {
        mode: "dropdown",
        options: Object.entries(LAYOUT_LABELS).map(([value, label]) => ({ value, label: label.da })),
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
    name: "show_filter",
    selector: { boolean: {} },
  },
  {
    name: "show_period",
    selector: { boolean: {} },
  },
  {
    name: "show_layout",
    selector: { boolean: {} },
  },
  {
    name: "lang",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "auto", label: "Automatisk (fra Home Assistant)" },
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

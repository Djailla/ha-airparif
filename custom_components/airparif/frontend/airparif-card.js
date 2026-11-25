/**
 * AirParif card for Home Assistant.
 *
 * Shows the ATMO index and per-pollutant levels for today and tomorrow, plus
 * the Île-de-France pollution episodes, for one AirParif device.
 *
 *   type: custom:airparif-card
 *   device_id: <optional, defaults to the first AirParif device>
 *   title: <optional>
 *   show_pollutants: true
 *   tint: true            # tint each day with its air-quality color
 *   colors:               # optional, any CSS color or [r, g, b]
 *     bon: "#50F0E6"
 *     mauvais: [255, 80, 80]
 */

const TAG = "airparif-card";
const DOMAIN = "airparif";

// Official ATMO index scale and colors (defaults, overridable with `colors`).
const LEVELS = {
  bon: { index: 1, color: "#50F0E6" },
  moyen: { index: 2, color: "#50CCAA" },
  degrade: { index: 3, color: "#F0E641" },
  mauvais: { index: 4, color: "#FF5050" },
  tres_mauvais: { index: 5, color: "#960032" },
  extremement_mauvais: { index: 6, color: "#803399" },
};

const POLLUTANTS = {
  no2: "NO₂",
  o3: "O₃",
  pm10: "PM10",
  pm25: "PM2.5",
  so2: "SO₂",
};

const STRINGS = {
  en: {
    today: "Today",
    tomorrow: "Tomorrow",
    no_data: "No forecast",
    no_device: "No AirParif device found.",
    episode: "Pollution episode",
    no_episode: "No pollution episode",
    levels: {
      bon: "Good",
      moyen: "Moderate",
      degrade: "Degraded",
      mauvais: "Poor",
      tres_mauvais: "Very poor",
      extremement_mauvais: "Extremely poor",
    },
    form: {
      device_id: "Device",
      title: "Title",
      show_pollutants: "Show pollutants",
      tint: "Tint each day with its air-quality color",
      colors: "Air-quality colors",
    },
  },
  fr: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    no_data: "Pas de prévision",
    no_device: "Aucun appareil AirParif trouvé.",
    episode: "Épisode de pollution",
    no_episode: "Aucun épisode de pollution",
    levels: {
      bon: "Bon",
      moyen: "Moyen",
      degrade: "Dégradé",
      mauvais: "Mauvais",
      tres_mauvais: "Très mauvais",
      extremement_mauvais: "Extrêmement mauvais",
    },
    form: {
      device_id: "Appareil",
      title: "Titre",
      show_pollutants: "Afficher les polluants",
      tint: "Teinter chaque jour avec la couleur de qualité de l'air",
      colors: "Couleurs de qualité de l'air",
    },
  },
};

// Entity translation keys set by the integration.
const KEYS = ["index_today", "index_tomorrow", "episode_today", "episode_tomorrow"];

const UNAVAILABLE = ["unavailable", "unknown"];

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const languageStrings = (hass) => {
  const lang = (hass?.locale?.language || hass?.language || "en").split("-")[0];
  return STRINGS[lang] || STRINGS.en;
};

/** Turn a configured color ([r, g, b] or any CSS color) into a safe CSS value. */
const toCss = (value) => {
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
    return `rgb(${value.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(", ")})`;
  }
  if (typeof value === "string" && /^[#(),.%\w\s-]+$/.test(value.trim())) {
    return value.trim();
  }
  return undefined;
};

/** Resolve a CSS color to [r, g, b] so we can pick a readable text color. */
let canvasCtx;
const toRgb = (css) => {
  canvasCtx ??= document.createElement("canvas").getContext("2d");
  if (!canvasCtx) return undefined;
  canvasCtx.fillStyle = "#000001";
  canvasCtx.fillStyle = css;
  const parsed = canvasCtx.fillStyle;
  if (parsed === "#000001") return undefined; // not a color the canvas understands
  if (parsed.startsWith("#")) {
    return [1, 3, 5].map((i) => parseInt(parsed.slice(i, i + 2), 16));
  }
  const m = parsed.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : undefined;
};

const readableText = (css) => {
  const rgb = toRgb(css);
  if (!rgb) return "var(--primary-text-color)";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#000" : "#fff";
};

class AirParifCard extends HTMLElement {
  static getStubConfig() {
    return { show_pollutants: true, tint: true };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "device_id", selector: { device: { integration: DOMAIN } } },
        { name: "title", selector: { text: {} } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "show_pollutants", selector: { boolean: {} } },
            { name: "tint", selector: { boolean: {} } },
          ],
        },
        {
          type: "expandable",
          name: "colors",
          flatten: false,
          icon: "mdi:palette",
          schema: Object.keys(LEVELS).map((level) => ({
            name: level,
            selector: { color_rgb: {} },
          })),
        },
      ],
      computeLabel: (schema, _data, hass) => {
        const t = languageStrings(hass);
        return t.form[schema.name] ?? t.levels[schema.name] ?? schema.name;
      },
    };
  }

  setConfig(config) {
    if (config.colors !== undefined && typeof config.colors !== "object") {
      throw new Error("`colors` must be a mapping of level to color");
    }
    this._config = { show_pollutants: true, tint: true, ...config };
    this._signature = undefined;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    if (this._hass) {
      this._render();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config?.show_pollutants === false ? 3 : 5;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  get _strings() {
    return languageStrings(this._hass);
  }

  /** Color and matching text color for a level, honoring the `colors` option. */
  _levelStyle(label) {
    const level = LEVELS[label];
    if (!level) return undefined;
    const color = toCss(this._config.colors?.[label]) ?? level.color;
    return { index: level.index, color, text: readableText(color) };
  }

  /** Map translation key -> entity_id for the configured (or first) AirParif device. */
  _findEntities() {
    const registry = Object.values(this._hass.entities || {}).filter(
      (entry) => entry.platform === DOMAIN && entry.device_id,
    );
    const deviceId = this._config.device_id || registry[0]?.device_id;
    const found = {};
    for (const entry of registry) {
      if (entry.device_id === deviceId && KEYS.includes(entry.translation_key)) {
        found[entry.translation_key] = entry.entity_id;
      }
    }
    return { deviceId, found };
  }

  _render() {
    if (!this._hass || !this._config || !this.shadowRoot) {
      return;
    }
    const { deviceId, found } = this._findEntities();
    const states = Object.fromEntries(
      Object.entries(found).map(([key, entityId]) => [key, this._hass.states[entityId]]),
    );

    // Only re-render when something we display changed.
    const signature = JSON.stringify([
      deviceId,
      this._config,
      this._hass.locale?.language,
      Object.values(states).map((s) => s && [s.state, s.attributes]),
    ]);
    if (signature === this._signature) {
      return;
    }
    this._signature = signature;

    const t = this._strings;
    const device = deviceId ? this._hass.devices?.[deviceId] : undefined;
    const title =
      this._config.title ?? (device?.name_by_user || device?.name || "AirParif");
    const today = states.index_today;
    const todayStyle =
      today && !UNAVAILABLE.includes(today.state)
        ? this._levelStyle(today.state)
        : undefined;

    let body;
    if (!deviceId) {
      body = `<div class="empty">${escapeHtml(t.no_device)}</div>`;
    } else {
      body = `
        ${this._renderEpisode(states.episode_today, states.episode_tomorrow)}
        <div class="days">
          ${this._renderDay(t.today, states.index_today)}
          ${this._renderDay(t.tomorrow, states.index_tomorrow)}
        </div>
        ${this._renderScale(today?.state)}`;
    }

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card style="${todayStyle ? `--today-color:${todayStyle.color}` : ""}">
        <div class="header">
          <ha-icon icon="mdi:weather-windy"></ha-icon>
          <span>${escapeHtml(title)}</span>
        </div>
        <div class="content">${body}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._moreInfo(el.dataset.entity));
    });
  }

  _renderLevel(label, size = "") {
    const t = this._strings;
    const style = this._levelStyle(label);
    if (!style) {
      return `<span class="pill unknown ${size}">${escapeHtml(label || "?")}</span>`;
    }
    return `<span class="pill ${size}" style="background:${style.color};color:${style.text}">${escapeHtml(t.levels[label])}</span>`;
  }

  _renderDay(name, stateObj) {
    const t = this._strings;
    const available = stateObj && !UNAVAILABLE.includes(stateObj.state);
    const style = available ? this._levelStyle(stateObj.state) : undefined;
    const tinted = this._config.tint && style;

    let pollutants = "";
    if (this._config.show_pollutants && available) {
      const values = stateObj.attributes.pollutants || {};
      pollutants = `
        <div class="pollutants">
          ${Object.entries(POLLUTANTS)
            .filter(([code]) => code in values)
            .map(([code, label]) => {
              const level = this._levelStyle(values[code]);
              return `
                <div class="pollutant">
                  <span class="dot" style="background:${level?.color || "var(--disabled-color)"}"></span>
                  <span class="name">${label}</span>
                  ${this._renderLevel(values[code], "small")}
                </div>`;
            })
            .join("")}
        </div>`;
    }

    return `
      <div class="day ${tinted ? "tinted" : ""}"
           style="--level-color:${style?.color || "var(--disabled-color)"}"
           ${stateObj ? `data-entity="${escapeHtml(stateObj.entity_id)}"` : ""}>
        <div class="day-name">${escapeHtml(name)}</div>
        ${
          available
            ? `<div class="index">
                 <span class="number">${style?.index ?? "?"}</span>
                 <span class="scale">/6</span>
               </div>
               ${this._renderLevel(stateObj.state)}`
            : `<div class="no-data">${escapeHtml(t.no_data)}</div>`
        }
        ${pollutants}
      </div>`;
  }

  /** The 6-step ATMO scale, with today's level highlighted. */
  _renderScale(current) {
    const t = this._strings;
    return `
      <div class="atmo-scale">
        ${Object.keys(LEVELS)
          .map((label) => {
            const style = this._levelStyle(label);
            return `<span class="step ${label === current ? "current" : ""}"
                          style="background:${style.color}"
                          title="${escapeHtml(`${style.index} · ${t.levels[label]}`)}"></span>`;
          })
          .join("")}
      </div>`;
  }

  _renderEpisode(today, tomorrow) {
    const t = this._strings;
    const days = [
      [t.today, today],
      [t.tomorrow, tomorrow],
    ].filter(([, s]) => s && !UNAVAILABLE.includes(s.state));
    if (!days.length) {
      return "";
    }
    const active = days.filter(([, s]) => s.state === "on");
    if (!active.length) {
      return `
        <div class="episode ok" data-entity="${escapeHtml(days[0][1].entity_id)}">
          <ha-icon icon="mdi:check-circle-outline"></ha-icon>
          <span>${escapeHtml(t.no_episode)}</span>
        </div>`;
    }
    const lines = active
      .map(([name, s]) => {
        const levels = Object.entries(s.attributes.pollutants || {})
          .filter(([, level]) => level)
          .map(([code, level]) => `${POLLUTANTS[code] || code}: ${level}`)
          .join(", ");
        return `<div><b>${escapeHtml(name)}</b>${levels ? ` · ${escapeHtml(levels)}` : ""}</div>`;
      })
      .join("");
    const message = active[0][1].attributes.message;
    return `
      <div class="episode active" data-entity="${escapeHtml(active[0][1].entity_id)}">
        <ha-icon icon="mdi:alert"></ha-icon>
        <div>
          <div class="episode-title">${escapeHtml(t.episode)}</div>
          ${lines}
          ${message ? `<div class="message">${escapeHtml(message)}</div>` : ""}
        </div>
      </div>`;
  }

  _moreInfo(entityId) {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

const STYLE = `
  ha-card { overflow: hidden; }
  .header {
    display: flex; align-items: center; gap: 8px;
    padding: 16px 16px 0; font-size: 1.2em; font-weight: 500;
  }
  .header ha-icon { color: var(--today-color, var(--state-icon-color)); }
  .content { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
  .empty, .no-data { color: var(--secondary-text-color); }
  .days { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .day {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 12px; border-radius: 12px; cursor: pointer;
    background: var(--secondary-background-color);
    border-top: 4px solid var(--level-color);
  }
  .day.tinted {
    background: color-mix(in srgb, var(--level-color) 18%, var(--card-background-color, var(--ha-card-background, #fff)));
  }
  .day-name { font-weight: 500; color: var(--secondary-text-color); }
  .index {
    display: flex; align-items: baseline; justify-content: center;
    width: 64px; height: 64px; border-radius: 50%;
    border: 6px solid var(--level-color); box-sizing: border-box;
    padding-top: 10px;
  }
  .index .number { font-size: 1.8em; font-weight: 600; line-height: 1; }
  .index .scale { font-size: 0.8em; color: var(--secondary-text-color); }
  .pill {
    display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-weight: 500; white-space: nowrap;
  }
  .pill.small { padding: 0 8px; font-size: 0.8em; }
  .pill.unknown { background: var(--disabled-color); color: var(--text-primary-color); }
  .pollutants { display: flex; flex-direction: column; gap: 4px; width: 100%; }
  .pollutant { display: flex; align-items: center; gap: 8px; }
  .pollutant .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .pollutant .name { font-size: 0.9em; flex: 1; }
  .atmo-scale { display: flex; gap: 4px; align-items: center; }
  .atmo-scale .step { flex: 1; height: 6px; border-radius: 3px; opacity: 0.45; }
  .atmo-scale .step.current { height: 10px; opacity: 1; }
  .episode {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 8px 12px; border-radius: 12px; cursor: pointer;
  }
  .episode.ok { color: var(--success-color, #43a047); background: rgba(67, 160, 71, 0.1); }
  .episode.active { color: var(--error-color, #db4437); background: rgba(219, 68, 55, 0.12); }
  .episode-title { font-weight: 600; }
  .episode .message { color: var(--primary-text-color); font-size: 0.9em; margin-top: 4px; }
`;

/*
 * Home Assistant can swap in a scoped custom-element registry while the page
 * boots, which may drop a definition made too early. Register now, and again
 * whenever the current registry no longer knows the card, until the dashboard
 * is up.
 */
const register = () => {
  if (!customElements.get(TAG)) {
    // A fresh subclass each time: a constructor can only be defined once.
    customElements.define(TAG, class extends AirParifCard {});
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "AirParif",
      description: "ATMO air-quality index, pollutants and pollution episodes.",
      preview: true,
      documentationURL: "https://github.com/Djailla/ha-airparif",
    });
  }
};

register();
let checks = 0;
const keepRegistered = setInterval(() => {
  register();
  if (++checks >= 60) clearInterval(keepRegistered); // 30 s is plenty for boot
}, 500);

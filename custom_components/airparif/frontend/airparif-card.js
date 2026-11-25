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
 */

const DOMAIN = "airparif";

// Official ATMO index colors.
const LEVELS = {
  bon: { index: 1, color: "#50F0E6", text: "#000" },
  moyen: { index: 2, color: "#50CCAA", text: "#000" },
  degrade: { index: 3, color: "#F0E641", text: "#000" },
  mauvais: { index: 4, color: "#FF5050", text: "#fff" },
  tres_mauvais: { index: 5, color: "#960032", text: "#fff" },
  extremement_mauvais: { index: 6, color: "#803399", text: "#fff" },
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
  },
};

// Entity translation keys set by the integration.
const KEYS = {
  index_today: "index_today",
  index_tomorrow: "index_tomorrow",
  episode_today: "episode_today",
  episode_tomorrow: "episode_tomorrow",
};

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

class AirParifCard extends HTMLElement {
  static getStubConfig() {
    return { show_pollutants: true };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "device_id", selector: { device: { integration: DOMAIN } } },
        { name: "title", selector: { text: {} } },
        { name: "show_pollutants", selector: { boolean: {} } },
      ],
      computeLabel: (schema) =>
        ({
          device_id: "Device",
          title: "Title",
          show_pollutants: "Show pollutants",
        })[schema.name],
    };
  }

  setConfig(config) {
    this._config = { show_pollutants: true, ...config };
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
    const lang = (this._hass?.locale?.language || this._hass?.language || "en").split("-")[0];
    return STRINGS[lang] || STRINGS.en;
  }

  /** Map translation key -> entity_id for the configured (or first) AirParif device. */
  _findEntities() {
    const registry = Object.values(this._hass.entities || {}).filter(
      (entry) => entry.platform === DOMAIN && entry.device_id,
    );
    const deviceId = this._config.device_id || registry[0]?.device_id;
    const found = {};
    for (const entry of registry) {
      if (entry.device_id === deviceId && entry.translation_key in KEYS) {
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

    let body;
    if (!deviceId) {
      body = `<div class="empty">${escapeHtml(t.no_device)}</div>`;
    } else {
      body = `
        ${this._renderEpisode(states.episode_today, states.episode_tomorrow)}
        <div class="days">
          ${this._renderDay(t.today, states.index_today)}
          ${this._renderDay(t.tomorrow, states.index_tomorrow)}
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
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
    const level = LEVELS[label];
    if (!level) {
      return `<span class="pill unknown ${size}">${escapeHtml(label || "?")}</span>`;
    }
    return `<span class="pill ${size}" style="background:${level.color};color:${level.text}">${escapeHtml(t.levels[label])}</span>`;
  }

  _renderDay(name, stateObj) {
    const t = this._strings;
    const available =
      stateObj && !["unavailable", "unknown"].includes(stateObj.state);
    const level = available ? LEVELS[stateObj.state] : undefined;

    let pollutants = "";
    if (this._config.show_pollutants && available) {
      const values = stateObj.attributes.pollutants || {};
      pollutants = `
        <div class="pollutants">
          ${Object.entries(POLLUTANTS)
            .filter(([code]) => code in values)
            .map(
              ([code, label]) => `
                <div class="pollutant">
                  <span class="name">${label}</span>
                  ${this._renderLevel(values[code], "small")}
                </div>`,
            )
            .join("")}
        </div>`;
    }

    return `
      <div class="day" ${stateObj ? `data-entity="${escapeHtml(stateObj.entity_id)}"` : ""}>
        <div class="day-name">${escapeHtml(name)}</div>
        ${
          available
            ? `<div class="index" style="--level-color:${level?.color || "var(--disabled-color)"}">
                 <span class="number">${level?.index ?? "?"}</span>
                 <span class="scale">/6</span>
               </div>
               ${this._renderLevel(stateObj.state)}`
            : `<div class="no-data">${escapeHtml(t.no_data)}</div>`
        }
        ${pollutants}
      </div>`;
  }

  _renderEpisode(today, tomorrow) {
    const t = this._strings;
    const days = [
      [t.today, today],
      [t.tomorrow, tomorrow],
    ].filter(([, s]) => s && !["unavailable", "unknown"].includes(s.state));
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
  .header ha-icon { color: var(--state-icon-color); }
  .content { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
  .empty, .no-data { color: var(--secondary-text-color); }
  .days { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .day {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 12px; border-radius: 12px; cursor: pointer;
    background: var(--secondary-background-color);
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
  .pollutant { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pollutant .name { font-size: 0.9em; }
  .episode {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 8px 12px; border-radius: 12px; cursor: pointer;
  }
  .episode.ok { color: var(--success-color, #43a047); background: rgba(67, 160, 71, 0.1); }
  .episode.active { color: var(--error-color, #db4437); background: rgba(219, 68, 55, 0.12); }
  .episode-title { font-weight: 600; }
  .episode .message { color: var(--primary-text-color); font-size: 0.9em; margin-top: 4px; }
`;

if (!customElements.get("airparif-card")) {
  customElements.define("airparif-card", AirParifCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "airparif-card",
    name: "AirParif",
    description: "ATMO air-quality index, pollutants and pollution episodes.",
    preview: true,
    documentationURL: "https://github.com/Djailla/ha-airparif",
  });
}

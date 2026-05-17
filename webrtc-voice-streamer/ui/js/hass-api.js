import { logError } from './logger.js';

export class HassApi {
  getHass() {
    try {
      if (window.parent && window.parent.document) {
        const ha = window.parent.document.querySelector("home-assistant");
        if (ha && ha.hass) {
          return ha.hass;
        }
      }
    } catch (e) {
      console.warn("Cannot access parent Home Assistant object", e);
    }
    return null;
  }

  async fetchServerIp() {
    try {
      const res = await fetch("./api/local_ip");
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("Failed to fetch server config from backend API.", e);
    }
    return null;
  }

  async fetchMediaPlayers() {
    const hass = this.getHass();
    if (hass) {
      return Object.values(hass.states)
        .filter((entity) => entity.entity_id.startsWith("media_player."))
        .map((entity) => ({
          entity_id: entity.entity_id,
          name: entity.attributes.friendly_name || entity.entity_id,
          state: entity.state,
        }));
    } else {
      const res = await fetch("./api/media_players");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const players = await res.json();
      if (!Array.isArray(players)) {
        throw new Error(players.error || "Invalid response from server");
      }
      return players;
    }
  }

  waitForHassAndInitialize(onReady, maxRetries = 10, interval = 500) {
    let retries = 0;
    const checkHass = () => {
      const hass = this.getHass();
      if (hass) {
        console.log("Hass object found immediately. Proceeding.");
        onReady();
      } else if (retries < maxRetries) {
        retries++;
        console.log(`Waiting for hass object... (Attempt ${retries}/${maxRetries})`);
        setTimeout(checkHass, interval);
      } else {
        console.warn("Hass object not found after retries. Falling back to backend API.");
        onReady();
      }
    };
    checkHass();
  }

  async playMedia(entity_id, media_content_id) {
    const hass = this.getHass();
    if (hass) {
      console.log("Using HA Frontend to invoke media_player.play_media service.");
      await hass.callService("media_player", "play_media", {
        entity_id: entity_id,
        media_content_id: media_content_id,
        media_content_type: "music",
      });
      console.log("HA Frontend play_media service call successful.");
    } else {
      console.log("HA Frontend object not available. Falling back to backend /api/play_media.");
      const res = await fetch("./api/play_media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id, media_content_id }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Status ${res.status}: ${errorText}`);
      }
      console.log("Backend play_media API call successful.");
    }
  }

  async stopMedia(entity_id) {
    const hass = this.getHass();
    if (hass) {
      console.log("Using HA Frontend to invoke media_player.media_stop service.");
      await hass.callService("media_player", "media_stop", { entity_id });
      console.log("HA Frontend media_stop service call successful.");
    } else {
      console.log("HA Frontend object not available. Falling back to backend /api/stop_media.");
      const res = await fetch("./api/stop_media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Status ${res.status}: ${errorText}`);
      }
      console.log("Backend stop_media API call successful.");
    }
  }

  async getMediaPlayerState(entity_id) {
    const hass = this.getHass();
    if (hass) {
      const entity = hass.states[entity_id];
      if (entity) return entity.state;
    } else {
      try {
        const res = await fetch("./api/media_players");
        if (res.ok) {
          const players = await res.json();
          const player = players.find((p) => p.entity_id === entity_id);
          if (player) return player.state;
        }
      } catch (e) {
        // Ignore fetch errors during polling
      }
    }
    return null;
  }
}

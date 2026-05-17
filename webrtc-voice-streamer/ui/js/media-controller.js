import { logError } from "./logger.js";

export class MediaController {
  constructor(hassApi, onStateChangeCallback) {
    this.hassApi = hassApi;
    this.isMediaPlaying = false;
    this.mediaPlayerPollInterval = null;
    this.activeStreams = [];
    this.currentPollingEntity = null;
    this.onStateChangeCallback = onStateChangeCallback;

    this.mediaPlayerSelect = document.getElementById("media-player-select");

    this.mediaPlayerSelect.addEventListener("change", () =>
      this.onMediaPlayerChanged(),
    );
  }

  onMediaPlayerChanged() {
    const entity_id = this.mediaPlayerSelect.value;
    if (!entity_id) {
      this.stopMediaPlayerPolling();
      this.isMediaPlaying = false;
    }
    if (this.onStateChangeCallback) this.onStateChangeCallback('selection_changed');
  }

  getSelectedPlayer() {
    return this.mediaPlayerSelect.value;
  }

  setActiveStreams(streams) {
    this.activeStreams = streams;
  }

  async populateMediaPlayers() {
    console.log("Fetching media players...");
    try {
      const players = await this.hassApi.fetchMediaPlayers();
      console.log(`Found ${players.length} media players.`);

      this.mediaPlayerSelect.innerHTML =
        '<option value="">-- Select a Media Player --</option>';
      players.forEach((p) => {
        if (p.state !== "unavailable" && p.state !== "off") {
          const opt = document.createElement("option");
          opt.value = p.entity_id;
          opt.textContent = `${p.name}`;
          this.mediaPlayerSelect.appendChild(opt);
        }
      });
    } catch (e) {
      logError("Failed to load media players", e);
      this.mediaPlayerSelect.innerHTML =
        '<option value="">Failed to load</option>';
    }
  }

  async playMedia(entity_id, media_content_id) {
    try {
      await this.hassApi.playMedia(entity_id, media_content_id);
    } catch (e) {
      logError("Error playing media.", e);
      throw e;
    }
  }

  async stopMedia(entity_id) {
    try {
      await this.hassApi.stopMedia(entity_id);
    } catch (e) {
      logError("Error stopping media.", e);
      throw e;
    }
  }

  stopMediaPlayerPolling() {
    if (this.mediaPlayerPollInterval) {
      clearInterval(this.mediaPlayerPollInterval);
      this.mediaPlayerPollInterval = null;
    }
    this.currentPollingEntity = null;
  }

  startContinuousPolling(entity_id) {
    if (
      this.currentPollingEntity === entity_id &&
      this.mediaPlayerPollInterval
    ) {
      return;
    }

    this.stopMediaPlayerPolling();
    this.currentPollingEntity = entity_id;

    this.mediaPlayerPollInterval = setInterval(async () => {
      const state = await this.hassApi.getMediaPlayerState(entity_id);
      this.handleMediaPlayerState(state);
    }, 500);
  }

  handleMediaPlayerState(state) {
    if (!state) return;

    const isPlayingState = state === "playing" || state === "buffering";
    
    if (this.isMediaPlaying !== isPlayingState) {
       this.isMediaPlaying = isPlayingState;
       if (this.onStateChangeCallback) {
           this.onStateChangeCallback(isPlayingState ? 'playing' : 'stopped');
       }
    }
  }
}

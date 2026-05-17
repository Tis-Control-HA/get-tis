import { initLogger, logError } from "./logger.js";
import { HassApi } from "./hass-api.js";
import { AudioVisualizer } from "./visualizer.js";
import { SignalingClient } from "./websocket-client.js";
import { WebRTCManager } from "./webrtc-manager.js";
import { MediaController } from "./media-controller.js";

// State
let streamUrl = "";
let isWsConnected = false;
let isLoading = false;
let isStreaming = false;

// DOM Elements
const wsStatus = document.getElementById("ws-status");
const visualizerCanvas = document.getElementById("visualizer");
const btnMic = document.getElementById("btn-mic");
const micErrorMsg = document.getElementById("mic-error-msg");
const mediaPlayerSelect = document.getElementById("media-player-select");

initLogger("error-log-container", "error-logs", "clear-errors-btn");

const hassApi = new HassApi();
const visualizer = new AudioVisualizer(visualizerCanvas);

// Setup MediaController
const mediaController = new MediaController(hassApi, (event) => {
  if (event === 'selection_changed') {
    updateButtonUI();
  } else if (event === 'stopped' && isStreaming && !isLoading) {
    stopStreamingFlow();
  } else if (event === 'playing' && isStreaming && !isLoading) {
    updateButtonUI();
  }
});

// Setup Signaling Client
const signalingClient = new SignalingClient({
  onSenderReady: () => webrtcManager.handleSenderReady(),
  onAnswer: (answer) => webrtcManager.handleAnswer(answer),
  onStreamsUpdated: () => {},
  onConnectionChange: (isConnected) => {
    isWsConnected = isConnected;
    if (isConnected) {
      wsStatus.textContent = "Connected";
      wsStatus.className =
        "px-3 py-1 rounded-full text-sm font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors duration-300";
    } else {
      wsStatus.textContent = "Disconnected";
      wsStatus.className =
        "px-3 py-1 rounded-full text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 transition-colors duration-300";
      if (isStreaming) {
        stopStreamingFlow();
      }
    }
    updateButtonUI();
  },
});

// Setup WebRTC Manager
const webrtcManager = new WebRTCManager(visualizer, signalingClient);

// Fetch initial server config for stream URL
streamUrl = `http://[IP_ADDRESS]:8081/stream/latest.mp3`;
hassApi.fetchServerIp().then((data) => {
  if (data && data.ip && data.ip !== "127.0.0.1") {
    streamUrl = `http://${data.ip}:${data.audio_port || 8081}/stream/latest.mp3`;
  }
});

hassApi.waitForHassAndInitialize(() => {
  mediaController.populateMediaPlayers();
});

signalingClient.connect();

// UI Coordination
function updateButtonUI() {
  const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  const mediaPlayerSelected = !!mediaPlayerSelect.value;

  if (!isHttps || !isWsConnected || !mediaPlayerSelected) {
    btnMic.className = "bg-red-500 hover:bg-red-600 p-6 text-white rounded-full font-medium cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 w-[250px] h-[250px] shadow-lg shadow-red-500/20 active:scale-[0.95] text-2xl";
    btnMic.disabled = false;
  } else if (isLoading) {
    btnMic.className = "bg-slate-500 p-6 text-white rounded-full font-medium cursor-not-allowed transition-all duration-200 flex flex-col items-center justify-center gap-2 w-[250px] h-[250px] shadow-lg shadow-slate-500/20 text-2xl opacity-75 animate-pulse";
    btnMic.disabled = true;
  } else if (isStreaming) {
    btnMic.className = "bg-emerald-500 hover:bg-emerald-600 p-6 text-white rounded-full font-medium cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 w-[250px] h-[250px] shadow-lg shadow-emerald-500/20 active:scale-[0.95] text-2xl";
    btnMic.disabled = false;
  } else {
    btnMic.className = "bg-sky-500 hover:bg-sky-600 p-6 text-white rounded-full font-medium cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 w-[250px] h-[250px] shadow-lg shadow-sky-500/20 active:scale-[0.95] text-2xl";
    btnMic.disabled = false;
  }
}

async function startStreamingFlow() {
  isLoading = true;
  updateButtonUI();
  micErrorMsg.textContent = "";

  try {
    await webrtcManager.startMic();
  } catch (e) {
    isLoading = false;
    updateButtonUI();
    micErrorMsg.textContent = "Failed to access microphone.";
    return;
  }

  const entity_id = mediaController.getSelectedPlayer();
  
  try {
    mediaController.startContinuousPolling(entity_id);
    await mediaController.playMedia(entity_id, streamUrl);

    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (mediaController.isMediaPlaying) {
        clearInterval(checkInterval);
        finishStartStreaming();
      } else if (attempts >= 10) {
        clearInterval(checkInterval);
        handleStreamingFailure("Media player failed to start playing in time.");
      }
    }, 500);

  } catch (e) {
    handleStreamingFailure("Failed to play media on device.");
  }
}

function finishStartStreaming() {
  isLoading = false;
  isStreaming = true;
  webrtcManager.startVisualizer();
  updateButtonUI();
}

function handleStreamingFailure(msg) {
  isLoading = false;
  isStreaming = false;
  webrtcManager.stopMic();
  mediaController.stopMediaPlayerPolling();
  updateButtonUI();
  micErrorMsg.textContent = msg;
}

async function stopStreamingFlow() {
  isLoading = true;
  updateButtonUI();

  const entity_id = mediaController.getSelectedPlayer();
  if (entity_id) {
    try {
      await mediaController.stopMedia(entity_id);
    } catch (e) {
      logError("Failed to stop media", e);
    }
  }

  webrtcManager.stopMic();
  mediaController.stopMediaPlayerPolling();
  
  isLoading = false;
  isStreaming = false;
  updateButtonUI();
}

btnMic.onclick = () => {
  const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  const mediaPlayerSelected = !!mediaPlayerSelect.value;

  micErrorMsg.textContent = "";

  if (!isHttps || !isWsConnected || !mediaPlayerSelected) {
    const errors = [];
    if (!isHttps) errors.push("access using HTTPS");
    if (!isWsConnected) errors.push("connect to the server");
    if (!mediaPlayerSelected) errors.push("pick a media player");
    micErrorMsg.textContent = `Please ${errors.join(" and ")}.`;
    return;
  }

  if (isLoading) return;

  if (isStreaming) {
    stopStreamingFlow();
  } else {
    startStreamingFlow();
  }
};

updateButtonUI();

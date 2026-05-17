import { logError } from './logger.js';

export class SignalingClient {
  constructor(callbacks) {
    this.ws = null;
    this.callbacks = callbacks;
    this.activeStreams = [];
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsPath = window.location.pathname.replace(/\/$/, "") + "/ws";
    const wsUrl = `${protocol}//${window.location.host}${wsPath}`;

    console.log(`Attempting WebSocket connection to: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connection opened successfully.");
      if (this.callbacks.onConnectionChange) {
        this.callbacks.onConnectionChange(true);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed. Attempting to reconnect in 3 seconds...");
      if (this.callbacks.onConnectionChange) {
        this.callbacks.onConnectionChange(false);
      }
      setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (err) => {
      logError("WebSocket encountered an error.", err);
    };

    this.ws.onmessage = async (e) => {
      console.log("WebSocket message received:", e.data);
      try {
        const msg = JSON.parse(e.data);

        switch (msg.type) {
          case "sender_ready":
            console.log("Sender ready received, creating WebRTC offer...");
            if (this.callbacks.onSenderReady) this.callbacks.onSenderReady();
            break;

          case "webrtc_answer":
            console.log("Received WebRTC answer. Setting remote description...");
            if (this.callbacks.onAnswer) this.callbacks.onAnswer(msg.answer);
            break;

          case "available_streams":
            this.activeStreams = msg.streams || [];
            console.log("Available streams updated:", this.activeStreams);
            if (this.callbacks.onStreamsUpdated) this.callbacks.onStreamsUpdated(this.activeStreams);
            break;

          case "stream_available":
            if (!this.activeStreams.includes(msg.stream_id)) {
              this.activeStreams.push(msg.stream_id);
              console.log("Stream available:", msg.stream_id, "Active streams:", this.activeStreams);
              if (this.callbacks.onStreamsUpdated) this.callbacks.onStreamsUpdated(this.activeStreams);
            }
            break;

          case "stream_ended":
            this.activeStreams = this.activeStreams.filter((id) => id !== msg.stream_id);
            console.log("Stream ended:", msg.stream_id, "Active streams:", this.activeStreams);
            if (this.callbacks.onStreamsUpdated) this.callbacks.onStreamsUpdated(this.activeStreams);
            break;

          case "error":
            logError("Received error from signaling server: " + msg.message);
            break;

          default:
            console.log("Received unknown message type:", msg.type);
            break;
        }
      } catch (err) {
        logError("Failed to handle WebSocket message.", err);
      }
    };
  }

  sendStartSending() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("Sending start_sending command over WebSocket.");
      this.ws.send(JSON.stringify({ type: "start_sending" }));
    }
  }

  sendStopStream() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("Sending stop_stream command over WebSocket.");
      this.ws.send(JSON.stringify({ type: "stop_stream" }));
    }
  }

  sendOffer(offer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("Sending WebRTC offer over WebSocket...");
      this.ws.send(JSON.stringify({ type: "webrtc_offer", offer }));
    }
  }
}

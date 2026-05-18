import { logError } from "./logger.js";

export class WebRTCManager {
  constructor(visualizer, signalingClient) {
    this.visualizer = visualizer;
    this.signalingClient = signalingClient;

    this.peerConnection = null;
    this.mediaStream = null;
  }

  async startMic() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });

      this.peerConnection = new RTCPeerConnection({ iceServers: [] });

      this.peerConnection.oniceconnectionstatechange = () => {
        if (
          this.peerConnection &&
          this.peerConnection.iceConnectionState === "failed"
        ) {
          logError("WebRTC ICE Connection failed.");
        }
      };

      this.mediaStream.getAudioTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.mediaStream);
      });

      this.signalingClient.sendStartSending();
    } catch (e) {
      logError("Failed to start microphone", e);
      throw e;
    }
  }

  stopMic() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        t.stop();
      });
      this.mediaStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.signalingClient.sendStopStream();
    this.stopVisualizer();
  }

  startVisualizer() {
    if (this.mediaStream) {
      this.visualizer.start(this.mediaStream);
    }
  }

  stopVisualizer() {
    this.visualizer.stop();
  }

  async handleSenderReady() {
    if (this.peerConnection) {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await this.peerConnection.setLocalDescription(offer);

      this.signalingClient.sendOffer({
        sdp: this.peerConnection.localDescription.sdp,
        type: this.peerConnection.localDescription.type,
      });
    } else {
      console.warn(
        "Peer connection not initialized when sender_ready received.",
      );
    }
  }

  async handleAnswer(answer) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer),
      );
    } else {
      console.warn(
        "Peer connection not initialized when webrtc_answer received.",
      );
    }
  }
}

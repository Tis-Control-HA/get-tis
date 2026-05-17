import { logError } from "./logger.js";

export class WebRTCManager {
  constructor(visualizer, signalingClient) {
    this.visualizer = visualizer;
    this.signalingClient = signalingClient;

    this.peerConnection = null;
    this.mediaStream = null;
  }

  async startMic() {
    console.log("Requesting microphone access from browser...");
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
      console.log("Microphone access granted.", this.mediaStream);

      this.peerConnection = new RTCPeerConnection({ iceServers: [] });

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log(
          "ICE Connection State Change:",
          this.peerConnection.iceConnectionState,
        );
        if (
          this.peerConnection &&
          this.peerConnection.iceConnectionState === "failed"
        ) {
          logError("WebRTC ICE Connection failed.");
        }
      };

      this.mediaStream.getAudioTracks().forEach((track) => {
        console.log("Adding audio track to peer connection:", track.label);
        this.peerConnection.addTrack(track, this.mediaStream);
      });

      this.signalingClient.sendStartSending();
    } catch (e) {
      logError("Failed to start microphone", e);
      throw e;
    }
  }

  stopMic() {
    console.log("Stopping microphone and cleaning up WebRTC resources...");
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        console.log("Stopping track:", t.kind, t.label);
        t.stop();
      });
      this.mediaStream = null;
      console.log("Media stream stopped.");
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log("Peer connection closed.");
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
      console.log(
        "Remote description set successfully. WebRTC connection established.",
      );
    } else {
      console.warn(
        "Peer connection not initialized when webrtc_answer received.",
      );
    }
  }
}

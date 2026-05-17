export class AudioVisualizer {
  constructor(canvasElement) {
    this.visualizer = canvasElement;
    this.canvasCtx = canvasElement.getContext("2d");
    this.audioContext = null;
    this.analyser = null;
    this.animationFrame = null;
  }

  start(stream) {
    console.log("Setting up audio visualization canvas.");
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationFrame = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      this.canvasCtx.fillStyle = "#0f172a"; // Tailwind slate-900
      this.canvasCtx.fillRect(0, 0, this.visualizer.width, this.visualizer.height);

      const barWidth = (this.visualizer.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * this.visualizer.height;
        // Draw bars using sky-500 base color (rgba 14, 165, 233)
        const opacity = Math.max(0.15, dataArray[i] / 255);
        this.canvasCtx.fillStyle = `rgba(14, 165, 233, ${opacity})`;
        this.canvasCtx.fillRect(x, this.visualizer.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.canvasCtx.clearRect(0, 0, this.visualizer.width, this.visualizer.height);
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

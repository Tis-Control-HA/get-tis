import asyncio
import fractions
import logging
import os

import av
from aiohttp import web
from license_middleware import license_middleware

logger = logging.getLogger(__name__)


class AudioStreamServer:
    def __init__(self, relay_server):
        self.relay_server = relay_server
        self.app = web.Application(middlewares=[license_middleware])
        self.app.router.add_get("/health", self.health_check)
        self.app.router.add_get("/stream/latest.mp3", self.latest_stream_handler)
        self.app.router.add_get("/stream/{stream_id}.mp3", self.stream_handler)
        self.app.router.add_get("/stream/status", self.status_handler)
        self.runner = None
        self.site = None

    async def health_check(self, request):
        return web.Response(text="OK")

    async def latest_stream_handler(self, request):
        if not self.relay_server.active_streams:
            html_content = """
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        background-color: #1c1c1c;
                        color: #e0e0e0;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        text-align: center;
                    }
                    .loader {
                        border: 4px solid #333;
                        border-top: 4px solid #03a9f4;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin-bottom: 20px;
                    }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    .btn {
                        background-color: #03a9f4;
                        border: none;
                        color: white;
                        padding: 12px 24px;
                        text-align: center;
                        text-decoration: none;
                        display: inline-block;
                        font-size: 16px;
                        margin-top: 20px;
                        cursor: pointer;
                        border-radius: 4px;
                        transition: background-color 0.3s;
                        font-weight: 500;
                    }
                    .btn:hover {
                        background-color: #0288d1;
                    }
                </style>
                <script>
                    let delay = 1000;
                    let polling = true;

                    async function checkStream() {
                        if (!polling) return;

                        try {
                            const response = await fetch('./status');
                            if (response.ok) {
                                const data = await response.json();
                                if (data.active_streams && data.active_streams.length > 0) {
                                    // Stream detected
                                    polling = false;
                                    document.getElementById('loader').style.display = 'none';
                                    document.getElementById('status-text').innerText = 'Audio Stream Ready';
                                    document.getElementById('status-text').style.color = '#4CAF50';
                                    document.getElementById('start-btn').style.display = 'inline-block';
                                    return;
                                }
                            }
                        } catch (e) {
                            console.log("Waiting for stream...");
                        }

                        // Exponential backoff
                        delay = Math.min(delay * 1.5, 10000);
                        setTimeout(checkStream, delay);
                    }
                    // Check initially
                    setTimeout(checkStream, delay);
                </script>
            </head>
            <body>
                <div>
                    <div id="loader" class="loader" style="margin: 0 auto 20px auto;"></div>
                    <h3 id="status-text">Waiting for Audio Stream...</h3>
                    <button id="start-btn" class="btn" style="display: none;" onclick="window.location.reload()">Start Listening</button>
                    <p style="color: #888; font-size: 0.9em; margin-top: 20px;">Standby Mode</p>
                </div>
            </body>
            </html>
            """
            return web.Response(text=html_content, content_type="text/html")

        # Get latest stream (last inserted key)
        stream_id = list(self.relay_server.active_streams.keys())[-1]

        # Delegate to stream_handler
        request.match_info["stream_id"] = stream_id
        return await self.stream_handler(request)

    async def start(self, host="0.0.0.0", port=None, ssl_context=None):
        if port is None:
            port = int(os.environ.get("AUDIO_PORT", 8081))
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, host, port, ssl_context=ssl_context)
        await self.site.start()
        logger.info(f"Audio Stream Server started on {host}:{port}")

    async def stop(self):
        if self.site:
            await self.site.stop()
        if self.runner:
            await self.runner.cleanup()

    async def status_handler(self, request):
        return web.json_response(
            {"active_streams": list(self.relay_server.active_streams.keys())}
        )

    async def stream_handler(self, request):
        stream_id = request.match_info["stream_id"]
        stream_info = self.relay_server.active_streams.get(stream_id)

        if not stream_info:
            return web.Response(status=404, text="Stream not found")

        logger.info(f"Starting audio stream for {stream_id} to {request.remote}")

        # Subscribe to the track via MediaRelay to get a fresh consumer
        source_track = stream_info["track"]
        try:
            track = self.relay_server.relay.subscribe(source_track)
        except Exception as e:
            logger.error(f"Failed to subscribe to track: {e}")
            return web.Response(status=500, text="Failed to subscribe to media track")

        response = web.StreamResponse(
            status=200,
            reason="OK",
            headers={
                "Content-Type": "audio/mpeg",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
        await response.prepare(request)

        # Setup MP3 encoding
        try:
            # Create MP3 encoder
            codec = av.codec.Codec("mp3", "w")
            codec_context = av.CodecContext.create(codec)
            codec_context.bit_rate = 128000
            codec_context.sample_rate = 44100
            codec_context.format = av.AudioFormat("s16p")
            codec_context.layout = "stereo"
            codec_context.time_base = fractions.Fraction(1, 44100)

            # Open the codec
            codec_context.open()

            # Resampler to ensure compatible format for MP3 encoder
            resampler = av.AudioResampler(
                format="s16p",
                layout="stereo",
                rate=44100,
            )

            # Start streaming
            while True:
                try:
                    frame = await track.recv()

                    # Resample
                    resampled_frames = resampler.resample(frame)

                    for r_frame in resampled_frames:
                        packets = codec_context.encode(r_frame)
                        for packet in packets:
                            await response.write(bytes(packet))

                except Exception as e:
                    # End of stream or error
                    logger.info(f"Stream ended or error: {e}")
                    break

        except asyncio.CancelledError:
            logger.info("Client disconnected")
        except Exception as e:
            logger.error(f"Streaming error: {e}")
        finally:
            # Clean up track subscription
            # track.stop() # aiortc tracks don't have stop(), they stop when upstream stops or GC?
            # MediaRelay tracks handle cleanup when they are no longer iterated?
            pass

        return response

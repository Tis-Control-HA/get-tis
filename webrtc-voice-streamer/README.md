# WebRTC Voice Streamer Add-on

The WebRTC Voice Streamer is a Home Assistant Add-on that allows you to stream your voice directly to your Home Assistant media players in real-time. It provides a simple, interactive web interface where you can select a media player and use your microphone to send audio instantly.

## Overview

This add-on provides an easy-to-use voice streaming interface accessible directly from Home Assistant. It features a modern web UI with a live audio visualizer, allowing you to easily pick an available media player and start broadcasting your voice. 

## Important Network Requirement

To use your microphone in the browser, a secure context (HTTPS) is required. 

If you are accessing your Home Assistant instance externally via HTTPS using the Cloudflare add-on (e.g., `https://example.tis-homeassistant.com`), **you must be connected to the same LAN network** as your Home Assistant server for the local voice stream to connect and function properly.

## Installation

1. Navigate to **Settings** > **Add-ons** > **Add-on Store**.
2. Click the **dots** (top-right) > **Repositories**.
3. Add `https://github.com/KarimTIS/webrtc-voice-streamer` (if you haven't already).
4. Find **"Voice Streaming Backend"** and click **Install**.
5. Start the Add-on.
6. Click **Open Web UI** on the Add-on page to access the Voice Streamer.

## Usage

1. Open the Web UI from the Add-on page.
2. Select your desired media player from the dropdown list.
3. Click the Microphone button to start streaming your voice. The button will indicate the active streaming state, and the visualizer will show your audio.
4. Click the button again to stop.

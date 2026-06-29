# ClipCull

Local AI-powered video footage culling tool for event photographers. Scans proxy files for technically unusable clips (black frames, dark/lens-cap, heavy shake, blur, silence, ultra-short) and quarantines them for review.

## Install

```sh
pip install -e .
```

Requires Python 3.10+ and [ffmpeg](https://ffmpeg.org/download.html) installed on your system.

## Usage

```sh
clipcull
```

This starts a local server at `http://localhost:8080` and opens the review UI in your browser. Point it at a folder of proxy clips to scan.

### Download ML models manually

```sh
clipcull --download-models
```

Models are downloaded automatically on first run to `~/.clipcull/models/`. If download fails (no internet), the tool runs in heuristics-only mode using ffmpeg.

### Configuration

Create `clipcull.config.json` in your scan folder (or `~/.clipcull/config.json` for global defaults):

```json
{
  "black": { "frame_threshold": 0.80 },
  "dark": { "yavg_threshold": 10 },
  "silent": { "silence_threshold": 0.90 },
  "short": { "duration_threshold": 2.0 },
  "blur": { "score_threshold": 0.7 },
  "shake": { "score_threshold": 0.7 }
}
```

All thresholds are optional — defaults are used for any omitted values.

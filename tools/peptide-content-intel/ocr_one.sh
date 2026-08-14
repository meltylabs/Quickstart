#!/bin/zsh
# OCR one TikTok video's on-screen text. FREE - yt-dlp + ffmpeg + macOS Vision.
# $1 = video id, $2 = url
#
# DEPENDENCY, READ BEFORE RERUNNING: line 17 shells out to `/tmp/ocrbin`, a
# throwaway Swift binary built during the 2026-07-25 run that wraps
# VNRecognizeTextRequest and prints recognised strings for each PNG passed as
# argv. It lived in /tmp and is gone; its source was never checked in. Rebuild
# an equivalent (Vision framework, accurate recognition level, en-US) before
# rerunning, or the script writes empty output and falls through to __NO_TEXT__.
# Run of record: 487 videos attempted -> 377 with real on-screen text,
# 67 no-frames, 39 no-text, 4 download-failed. Zero API credits.
export PATH=/opt/homebrew/bin:$PATH
ROOT=/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel
ID=$1; URL=$2
OUT="$ROOT/ocr/text/$ID.txt"
[[ -f "$OUT" ]] && exit 0
TMP=$(mktemp -d /tmp/ocr_XXXXXX)
trap "rm -rf $TMP" EXIT
yt-dlp --socket-timeout 20 --no-warnings --quiet -f "mp4/best[ext=mp4]/best" -o "$TMP/v.%(ext)s" "$URL" >/dev/null 2>&1
V=$(ls "$TMP"/v.* 2>/dev/null | head -1)
[[ -z "$V" ]] && { echo "__DOWNLOAD_FAILED__" > "$OUT"; exit 0; }
# 1 frame every 2s, capped at 8 frames - on-screen text is usually static
ffmpeg -loglevel error -i "$V" -vf "fps=1/2,scale=720:-1" -frames:v 8 "$TMP/f_%02d.png" >/dev/null 2>&1
ls "$TMP"/f_*.png >/dev/null 2>&1 || { echo "__NO_FRAMES__" > "$OUT"; exit 0; }
/tmp/ocrbin "$TMP"/f_*.png 2>/dev/null > "$OUT"
[[ -s "$OUT" ]] || echo "__NO_TEXT__" > "$OUT"

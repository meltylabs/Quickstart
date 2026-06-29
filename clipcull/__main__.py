import argparse
import os
import shutil
import sys


def _check_ffmpeg():
    if shutil.which("ffmpeg") and shutil.which("ffprobe"):
        return True
    print(
        "ffmpeg and ffprobe are required but not found.\n"
        "Install with:\n"
        "  macOS:   brew install ffmpeg\n"
        "  Ubuntu:  sudo apt install ffmpeg\n"
        "  Windows: https://ffmpeg.org/download.html",
        file=sys.stderr,
    )
    return False


def main():
    parser = argparse.ArgumentParser(
        prog="clipcull",
        description="Local AI-powered video footage culling tool",
    )
    parser.add_argument(
        "--download-models",
        action="store_true",
        help="Download ML models and exit",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("CONDUCTOR_PORT", 8080)),
        help="Server port (default: 8080, or $CONDUCTOR_PORT)",
    )
    args = parser.parse_args()

    if not _check_ffmpeg():
        sys.exit(1)

    from clipcull.models.downloader import download_models, ensure_models

    if args.download_models:
        success = download_models()
        sys.exit(0 if success else 1)

    ensure_models()

    import uvicorn

    uvicorn.run(
        "clipcull.server.app:app",
        host="127.0.0.1",
        port=args.port,
    )


if __name__ == "__main__":
    main()

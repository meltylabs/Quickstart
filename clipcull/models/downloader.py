import sys
from pathlib import Path

from clipcull.models.cache import MODELS_DIR, verify_model

VERSION_FILE = MODELS_DIR / "version.txt"
CURRENT_MODEL_VERSION = "1"

MODELS = {
    "blur_detector.onnx": {
        "repo_id": "clipcull/blur-detector",
        "filename": "blur_detector.onnx",
    },
    "motion_estimator.onnx": {
        "repo_id": "clipcull/motion-estimator",
        "filename": "motion_estimator.onnx",
    },
}


def models_available():
    if not MODELS_DIR.exists():
        return False
    if not VERSION_FILE.exists():
        return False
    if VERSION_FILE.read_text().strip() != CURRENT_MODEL_VERSION:
        return False
    return all(verify_model(name) for name in MODELS)


def download_models():
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print(
            "Error: huggingface-hub is not installed. "
            "Run: pip install huggingface-hub",
            file=sys.stderr,
        )
        return False

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    for local_name, spec in MODELS.items():
        dest = MODELS_DIR / local_name
        if dest.exists() and verify_model(local_name):
            continue

        if dest.exists():
            dest.unlink()

        print(f"Downloading {local_name}...")
        try:
            hf_hub_download(
                repo_id=spec["repo_id"],
                filename=spec["filename"],
                local_dir=MODELS_DIR,
                local_dir_use_symlinks=False,
            )
            downloaded = MODELS_DIR / spec["filename"]
            if downloaded != dest:
                downloaded.rename(dest)
        except Exception as e:
            if dest.exists():
                dest.unlink()
            print(
                f"Model download failed for {local_name}: {e}\n"
                "Check your internet connection and retry with: "
                "clipcull --download-models",
                file=sys.stderr,
            )
            return False

    VERSION_FILE.write_text(CURRENT_MODEL_VERSION)
    print("All models downloaded successfully.")
    return True


def ensure_models():
    if models_available():
        return True

    print("ML models not found. Attempting download...")
    if download_models():
        return True

    print(
        "ML models not available. "
        "Running in heuristics-only mode (Layer 1 only).",
        file=sys.stderr,
    )
    return False

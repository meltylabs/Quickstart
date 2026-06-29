import hashlib
from pathlib import Path

MODELS_DIR = Path.home() / ".clipcull" / "models"

CHECKSUMS = {
    "blur_detector.onnx": None,
    "motion_estimator.onnx": None,
}


def verify_model(name):
    path = MODELS_DIR / name
    if not path.exists():
        return False
    expected = CHECKSUMS.get(name)
    if expected is None:
        return True
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    return actual == expected


def get_model_path(name):
    path = MODELS_DIR / name
    if not path.exists():
        return None
    if not verify_model(name):
        path.unlink()
        return None
    return path

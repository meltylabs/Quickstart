import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULTS = {
    "black": {"frame_threshold": 0.80},
    "dark": {"yavg_threshold": 10},
    "silent": {"silence_threshold": 0.90},
    "short": {"duration_threshold": 2.0},
    "blur": {"score_threshold": 0.7},
    "shake": {"score_threshold": 0.7},
}

RANGES = {
    "black": {"frame_threshold": (0.50, 1.0)},
    "dark": {"yavg_threshold": (5, 30)},
    "silent": {"silence_threshold": (0.70, 1.0)},
    "short": {"duration_threshold": (0.5, 5.0)},
    "blur": {"score_threshold": (0.0, 1.0)},
    "shake": {"score_threshold": (0.0, 1.0)},
}


class ConfigError(Exception):
    pass


@dataclass
class ClipCullConfig:
    black: dict = field(default_factory=lambda: DEFAULTS["black"].copy())
    dark: dict = field(default_factory=lambda: DEFAULTS["dark"].copy())
    silent: dict = field(default_factory=lambda: DEFAULTS["silent"].copy())
    short: dict = field(default_factory=lambda: DEFAULTS["short"].copy())
    blur: dict = field(default_factory=lambda: DEFAULTS["blur"].copy())
    shake: dict = field(default_factory=lambda: DEFAULTS["shake"].copy())

    def get_threshold(self, category, key):
        return getattr(self, category)[key]


def _validate_value(category, key, value, path):
    if not isinstance(value, (int, float)):
        raise ConfigError(
            f"{path}: {category}.{key}: expected a number, got {type(value).__name__}"
        )
    if value < 0:
        raise ConfigError(f"{path}: {category}.{key}: must not be negative (got {value})")
    bounds = RANGES.get(category, {}).get(key)
    if bounds:
        lo, hi = bounds
        if not (lo <= value <= hi):
            raise ConfigError(
                f"{path}: {category}.{key}: {value} is out of range [{lo}, {hi}]"
            )


def _load_from_file(path):
    try:
        text = path.read_text()
    except OSError as e:
        raise ConfigError(f"Cannot read config file {path}: {e}")

    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        raise ConfigError(f"Invalid JSON in {path}: {e}")

    if not isinstance(raw, dict):
        raise ConfigError(f"Config file {path}: expected a JSON object at top level")

    config = ClipCullConfig()
    known_categories = set(DEFAULTS)

    for category, overrides in raw.items():
        if category not in known_categories:
            raise ConfigError(
                f"Unknown category '{category}' in {path}. "
                f"Valid: {', '.join(sorted(known_categories))}"
            )
        if not isinstance(overrides, dict):
            raise ConfigError(
                f"{path}: {category}: expected an object, got {type(overrides).__name__}"
            )

        merged = DEFAULTS[category].copy()
        known_keys = set(DEFAULTS[category])

        for key, value in overrides.items():
            if key not in known_keys:
                raise ConfigError(
                    f"Unknown key '{category}.{key}' in {path}. "
                    f"Valid: {', '.join(sorted(known_keys))}"
                )
            _validate_value(category, key, value, path)
            merged[key] = value

        setattr(config, category, merged)

    return config


def load_config(scan_folder=None):
    candidates = []
    if scan_folder:
        candidates.append(Path(scan_folder) / "clipcull.config.json")
    candidates.append(Path.home() / ".clipcull" / "config.json")

    for config_path in candidates:
        if config_path.exists():
            return _load_from_file(config_path)

    return ClipCullConfig()

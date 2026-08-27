#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend import store  # noqa: E402


def main() -> int:
    health = store.health_report()
    if health["status"] != "ok":
        print("Portal data is not ready.")
        for item in health["missing"]:
            print(f"missing: {item}")
        return 1

    cohort = store.cohort()
    sweep = store.sweep_summary()
    maps = store.maps_payload()

    assert cohort["n_samples"] == 12
    assert cohort["n_markers"] == 49
    assert cohort["nsub"] == 12000
    assert cohort["n_cells_in_atlas"] == 886525
    assert sweep["counts"]["transfer"] == 1848
    assert len(maps["x"]) == 3000
    assert len(maps["y"]) == 3000
    assert len(maps["labels"]) == 35
    for frac in (0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9):
        for seed in (0, 1):
            payload = store.transfer(frac, seed)
            assert payload["count"] == 132, (frac, seed, payload["count"])
    print("Portal data verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

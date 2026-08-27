from __future__ import annotations

import hashlib
import json
import math
import os
import statistics
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("XTB_DATA_DIR", ROOT / ".context" / "xtb-data"))
GENERATED_DIR = Path(os.environ.get("XTB_GENERATED_DIR", ROOT / "public" / "data" / "generated"))

EXPECTED_CSV_SHA256 = "100682c57ef65c94fede84d7b8253cbce620127832f3cf1ab8857681ce5db7c8"
EXPECTED_RDS_MD5 = {
    "NBM_CODEX_Atlas_Seurat.rds": "dec99e29079e83e59f389bf591b86cd2",
    "AML_NSM_RefMap_Seurat.rds": "b8aed7d26accdce4072b1d5f5046a58d",
}
EXPECTED_FRACS = [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9]
EXPECTED_FRAC_KEYS = {format(frac, ".2f").rstrip("0").rstrip(".") for frac in EXPECTED_FRACS}
REPRESENTATIVE_DONOR = "SB67_NBM37_H35_CODEX_Mesmer"

REQUIRED_SOURCE_FILES = (
    "data/nbm_codex_tabular.csv",
    "data/prep_meta.json",
    "data/sub_seed0.npz",
    "data/sub_seed1.npz",
    "data/PROVENANCE.md",
    "data/NBM.md5",
    "results/results_v5.jsonl",
    "results/maps.json",
    "code/v5_prep.py",
    "code/v5_worker.py",
    "code/xtb_pilot_v5.py",
    "code/export_maps.py",
)


class DataUnavailable(RuntimeError):
    """Raised when a portal endpoint needs data that has not been built."""


def relpath(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def source_path(relative: str) -> Path:
    return DATA_DIR / relative


def generated_path(relative: str) -> Path:
    return GENERATED_DIR / relative


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def digest(path: Path, algorithm: str) -> str:
    h = hashlib.new(algorithm)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def format_weight(value: float | str) -> str:
    number = float(value)
    return f"{number:.2f}".rstrip("0").rstrip(".")


def finite_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def mean(values: list[float]) -> float | None:
    clean = [v for v in values if not math.isnan(v) and not math.isinf(v)]
    if not clean:
        return None
    return statistics.fmean(clean)


def sanitize(value: Any) -> Any:
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, dict):
        return {str(k): sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value


def missing_items() -> list[str]:
    missing = [rel for rel in REQUIRED_SOURCE_FILES if not source_path(rel).exists()]
    manifest_path = generated_path("manifest.json")
    if not manifest_path.exists():
        missing.append("public/data/generated/manifest.json")
        return missing

    try:
        manifest = read_json(manifest_path)
    except json.JSONDecodeError:
        missing.append("public/data/generated/manifest.json: invalid JSON")
        return missing

    for store in manifest.get("zarr_stores", []):
        rel = store.get("path")
        if not rel:
            missing.append("public/data/generated/manifest.json: zarr store without path")
            continue
        path = generated_path(rel)
        if not path.exists():
            missing.append(f"public/data/generated/{store.get('path')}")
        zip_rel = store.get("zip_path")
        if zip_rel and not generated_path(zip_rel).exists():
            missing.append(f"public/data/generated/{zip_rel}")
    if not generated_path("biology.json").exists():
        missing.append("public/data/generated/biology.json")
    return missing


@lru_cache(maxsize=1)
def load_manifest() -> dict[str, Any]:
    path = generated_path("manifest.json")
    if not path.exists():
        raise DataUnavailable("Run ./scripts/setup.sh to sync and build portal data.")
    return read_json(path)


@lru_cache(maxsize=1)
def load_meta() -> dict[str, Any]:
    path = source_path("data/prep_meta.json")
    if not path.exists():
        raise DataUnavailable("Missing prep_meta.json. Run ./scripts/sync_xtb_data.sh.")
    return read_json(path)


@lru_cache(maxsize=1)
def load_maps() -> dict[str, Any]:
    path = generated_path("maps.json")
    if not path.exists():
        path = source_path("results/maps.json")
    if not path.exists():
        raise DataUnavailable("Missing maps.json. Run ./scripts/sync_xtb_data.sh.")
    return read_json(path)


@lru_cache(maxsize=1)
def load_results() -> list[dict[str, Any]]:
    path = source_path("results/results_v5.jsonl")
    if not path.exists():
        raise DataUnavailable("Missing results_v5.jsonl. Run ./scripts/sync_xtb_data.sh.")
    return read_jsonl(path)


@lru_cache(maxsize=1)
def load_biology() -> dict[str, Any]:
    path = generated_path("biology.json")
    if not path.exists():
        raise DataUnavailable("Missing biology.json. Run ./scripts/build_portal_data.py.")
    return read_json(path)


def health_report() -> dict[str, Any]:
    missing = missing_items()
    manifest: dict[str, Any] | None = None
    manifest_error = None
    if generated_path("manifest.json").exists():
        try:
            manifest = load_manifest()
        except Exception as exc:  # pragma: no cover - defensive status reporting
            manifest_error = str(exc)

    status = "ok" if not missing and not manifest_error else "missing"
    return sanitize(
        {
            "status": status,
            "data_dir": relpath(DATA_DIR),
            "generated_dir": relpath(GENERATED_DIR),
            "missing": missing,
            "manifest_error": manifest_error,
            "expected": {
                "csv_sha256": EXPECTED_CSV_SHA256,
                "rds_md5": EXPECTED_RDS_MD5,
                "representative_donor": REPRESENTATIVE_DONOR,
            },
            "manifest": manifest,
        }
    )


def provenance() -> dict[str, Any]:
    manifest = load_manifest()
    source = source_path("data/PROVENANCE.md")
    text = source.read_text(encoding="utf-8") if source.exists() else ""
    return sanitize(
        {
            "source": relpath(source),
            "markdown": text,
            "receipts": manifest.get("checks", {}),
            "code_receipts": manifest.get("code_receipts", []),
            "analysis_method": manifest.get("analysis_method", {}),
        }
    )


def cohort() -> dict[str, Any]:
    meta = load_meta()
    manifest = load_manifest()
    samples = list(meta.get("samples", []))
    return sanitize(
        {
            "samples": samples,
            "markers": list(meta.get("markers", [])),
            "n_samples": len(samples),
            "n_markers": len(meta.get("markers", [])),
            "n_cells_in_atlas": meta.get("n_cells_in_atlas"),
            "nsub": meta.get("nsub"),
            "representative_donor": REPRESENTATIVE_DONOR,
            "zarr_stores": manifest.get("zarr_stores", []),
        }
    )


def biology() -> dict[str, Any]:
    payload = load_biology()
    meta = load_meta()
    required = {
        "dataset",
        "paper",
        "annotations",
        "annotation_evidence",
        "artifact_summary",
        "samples",
        "marker_groups",
        "pipeline",
        "metric_definitions",
        "transfer_floor",
        "story",
    }
    missing = sorted(required - set(payload))
    if missing:
        raise DataUnavailable(f"biology.json missing required sections: {missing}")
    if int(payload.get("dataset", {}).get("source_rows", 0)) != int(meta.get("n_cells_in_atlas", 0)):
        raise DataUnavailable("biology.json source row count does not match prep_meta.json")
    return sanitize(payload)


def row_metric(row: dict[str, Any], names: tuple[str, ...]) -> float | None:
    for name in names:
        if name in row:
            parsed = finite_float(row.get(name))
            if parsed is not None:
                return parsed
    return None


def rows_for(kind: str, weight: float) -> list[dict[str, Any]]:
    return [
        r
        for r in load_results()
        if r.get("kind") == kind
        and r.get("frac") is not None
        and math.isclose(float(r.get("frac")), weight)
    ]


def sweep_summary() -> dict[str, Any]:
    maps = load_maps()
    weights = [float(v) for v in maps.get("fracs", EXPECTED_FRACS)]
    by_weight: list[dict[str, Any]] = []
    all_rows = load_results()

    for weight in weights:
        native_rows = rows_for("native", weight)
        transfer_rows = rows_for("transfer", weight)
        floor_rows = rows_for("floor", weight)
        native_values = [
            value
            for value in (
                row_metric(r, ("ari_vs_author", "accuracy", "acc", "ari", "score")) for r in native_rows
            )
            if value is not None
        ]
        transfer_values = [
            value
            for value in (
                row_metric(r, ("stability_ari", "stability", "transfer_stability", "agreement", "accuracy", "acc"))
                for r in transfer_rows
            )
            if value is not None
        ]
        floor_values = [
            value
            for value in (
                row_metric(r, ("ari_self", "stability", "agreement", "accuracy", "acc", "ari")) for r in floor_rows
            )
            if value is not None
        ]
        transfer_mean = mean(transfer_values)
        floor_mean = mean(floor_values)
        transfer_minus_floor = transfer_mean - floor_mean if transfer_mean is not None and floor_mean is not None else None
        key = format_weight(weight)

        by_weight.append(
            {
                "frac": weight,
                "key": key,
                "native_mean": mean(native_values),
                "transfer_stability_mean": transfer_mean,
                "stochastic_floor_mean": floor_mean,
                "transfer_minus_floor": transfer_minus_floor,
                "transfer_pairs_per_seed": {
                    str(seed): len(
                        [r for r in transfer_rows if int(r.get("seed", -1)) == seed]
                    )
                    for seed in (0, 1)
                },
                "floor_rows": len(floor_rows),
                "native_rows": len(native_rows),
                "map_metrics": maps.get("metrics", {}).get(key, {}),
            }
        )

    return sanitize(
        {
            "weights": by_weight,
            "counts": {
                "rows": len(all_rows),
                "native": sum(1 for r in all_rows if r.get("kind") == "native"),
                "transfer": sum(1 for r in all_rows if r.get("kind") == "transfer"),
                "floor": sum(1 for r in all_rows if r.get("kind") == "floor"),
                "unit_done": sum(1 for r in all_rows if r.get("kind") == "unit_done"),
            },
        }
    )


def transfer(frac: float, seed: int) -> dict[str, Any]:
    requested = format_weight(frac)
    if requested not in EXPECTED_FRAC_KEYS:
        raise ValueError(f"Unsupported spatial weight: {frac}. Expected one of {sorted(EXPECTED_FRAC_KEYS, key=float)}")
    rows = [
        r
        for r in load_results()
        if r.get("kind") == "transfer"
        and r.get("frac") is not None
        and math.isclose(float(r.get("frac")), frac)
        and int(r.get("seed", -1)) == seed
    ]
    rows.sort(key=lambda r: (str(r.get("src", "")), str(r.get("dst", ""))))
    values = [
        value
        for value in (
            row_metric(r, ("stability_ari", "stability", "transfer_stability", "agreement", "accuracy", "acc"))
            for r in rows
        )
        if value is not None
    ]
    return sanitize(
        {
            "frac": frac,
            "key": format_weight(frac),
            "seed": seed,
            "samples": load_meta().get("samples", []),
            "count": len(rows),
            "mean": mean(values),
            "rows": rows,
        }
    )


def maps_payload() -> dict[str, Any]:
    maps = load_maps()
    labels = maps.get("labels", {})
    expected_keys = {
        f"{prefix}{format_weight(frac)}"
        for frac in maps.get("fracs", EXPECTED_FRACS)
        for prefix in ("m", "s", "e", "a", "b")
    }
    if set(labels) != expected_keys:
        raise DataUnavailable("maps.json does not contain the required m/s/e/a/b label arrays for every weight.")
    return sanitize(
        {
            **maps,
            "representative_label": REPRESENTATIVE_DONOR,
            "label_lengths": {key: len(value) for key, value in labels.items()},
        }
    )


def vitessce_config(sample: str | None, seed: int) -> dict[str, Any]:
    meta = load_meta()
    samples = list(meta.get("samples", []))
    markers = list(meta.get("markers", []))
    if seed not in (0, 1):
        raise ValueError("seed must be 0 or 1")
    selected = sample or REPRESENTATIVE_DONOR
    if selected not in samples:
        raise ValueError(f"Unknown sample: {selected}")

    url = f"/data/generated/vitessce/seed{seed}/{selected}.zarr.zip"
    store_path = generated_path(f"vitessce/seed{seed}/{selected}.zarr.zip")
    if not store_path.exists():
        raise DataUnavailable(f"Missing Vitessce Zarr archive: {relpath(store_path)}")
    return sanitize(
        {
            "version": "1.0.17",
            "initStrategy": "auto",
            "name": f"{selected} seed {seed}",
            "description": "Real 12,000-cell CODEX normal bone-marrow donor subsample.",
            "datasets": [
                {
                    "uid": selected,
                    "name": selected,
                    "files": [
                        {
                            "fileType": "anndata.zarr.zip",
                            "url": url,
                            "options": {
                                "obsFeatureMatrix": {"path": "X"},
                                "obsEmbedding": [
                                    {
                                        "path": "obsm/spatial",
                                        "dims": [0, 1],
                                        "embeddingType": "spatial",
                                    }
                                ],
                                "obsSets": [{"name": "label_l1", "path": "obs/label_l1"}],
                                "featureLabels": {"path": "var/index"},
                            },
                        }
                    ],
                }
            ],
            "coordinationSpace": {
                "dataset": {"A": selected},
                "embeddingType": {"A": "spatial"},
                "featureSelection": {"A": [markers[0]] if markers else []},
            },
            "layout": [
                {
                    "component": "scatterplot",
                    "coordinationScopes": {
                        "dataset": "A",
                        "embeddingType": "A",
                        "featureSelection": "A",
                    },
                    "x": 0,
                    "y": 0,
                    "w": 8,
                    "h": 12,
                },
                {
                    "component": "obsSets",
                    "coordinationScopes": {"dataset": "A"},
                    "x": 8,
                    "y": 0,
                    "w": 4,
                    "h": 6,
                },
                {
                    "component": "featureList",
                    "coordinationScopes": {
                        "dataset": "A",
                        "featureSelection": "A",
                    },
                    "x": 8,
                    "y": 6,
                    "w": 4,
                    "h": 6,
                },
            ],
            "metadata": {
                "sample": selected,
                "seed": seed,
                "nsub": meta.get("nsub"),
                "markers": markers,
            },
        }
    )

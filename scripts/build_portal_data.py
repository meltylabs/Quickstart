#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anndata as ad
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("XTB_DATA_DIR", ROOT / ".context" / "xtb-data"))
GENERATED_DIR = Path(os.environ.get("XTB_GENERATED_DIR", ROOT / "public" / "data" / "generated"))

EXPECTED_CSV_SHA256 = "100682c57ef65c94fede84d7b8253cbce620127832f3cf1ab8857681ce5db7c8"
EXPECTED_RDS_MD5 = {
    "NBM_CODEX_Atlas_Seurat.rds": "dec99e29079e83e59f389bf591b86cd2",
    "AML_NSM_RefMap_Seurat.rds": "b8aed7d26accdce4072b1d5f5046a58d",
}
EXPECTED_FRACS = [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9]
EXPECTED_REPRESENTATIVE = "SB67_NBM37_H35_CODEX_Mesmer"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, allow_nan=False)
        handle.write("\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"Missing required artifact: {path}")
    return path


def fmt_weight(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def check_rds_receipts() -> dict[str, Any]:
    md5_file = require(DATA_DIR / "data" / "NBM.md5")
    text = md5_file.read_text(encoding="utf-8", errors="replace")
    receipts: dict[str, Any] = {}
    for filename, expected in EXPECTED_RDS_MD5.items():
        copied = DATA_DIR / "data" / filename
        actual = md5(copied) if copied.exists() else None
        receipts[filename] = {
            "expected": expected,
            "copied": copied.exists(),
            "actual": actual,
            "receipt_found": expected in text,
            "ok": actual == expected if actual else expected in text,
        }
    if not all(item["ok"] for item in receipts.values()):
        raise RuntimeError(f"RDS MD5 receipts failed: {receipts}")
    return receipts


def validate_maps(maps: dict[str, Any]) -> None:
    x = maps.get("x", [])
    y = maps.get("y", [])
    labels = maps.get("labels", {})
    if maps.get("donor") != EXPECTED_REPRESENTATIVE:
        raise RuntimeError(f"Unexpected representative donor in maps.json: {maps.get('donor')}")
    if len(x) != 3000 or len(y) != 3000:
        raise RuntimeError(f"maps.json must export 3000 x/y points, got {len(x)} and {len(y)}")
    if len(labels) != 35:
        raise RuntimeError(f"maps.json must contain 35 label arrays, got {len(labels)}")
    expected_keys = {f"{prefix}{fmt_weight(frac)}" for frac in EXPECTED_FRACS for prefix in ("m", "s", "e", "a", "b")}
    actual_keys = set(labels)
    if actual_keys != expected_keys:
        missing = sorted(expected_keys - actual_keys)
        extra = sorted(actual_keys - expected_keys)
        raise RuntimeError(f"maps.json label keys mismatch; missing={missing}, extra={extra}")
    for key, values in labels.items():
        if len(values) != 3000:
            raise RuntimeError(f"Label array {key} has {len(values)} rows, expected 3000")


def validate_results(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(row.get("kind") for row in rows)
    fracs = sorted({float(row["frac"]) for row in rows if "frac" in row and row.get("frac") is not None})
    if counts["transfer"] != 1848:
        raise RuntimeError(f"Expected 1,848 transfer rows, found {counts['transfer']}")
    if counts["native"] != 168:
        raise RuntimeError(f"Expected 168 native rows, found {counts['native']}")
    if counts["floor"] != 324:
        raise RuntimeError(f"Expected 324 floor rows, found {counts['floor']}")
    if [fmt_weight(f) for f in fracs] != [fmt_weight(f) for f in EXPECTED_FRACS]:
        raise RuntimeError(f"Unexpected spatial weights: {fracs}")
    for frac in EXPECTED_FRACS:
        for seed in (0, 1):
            n = sum(
                1
                for row in rows
                if row.get("kind") == "transfer"
                and math.isclose(float(row.get("frac", -1)), frac)
                and int(row.get("seed", -1)) == seed
            )
            if n != 132:
                raise RuntimeError(f"Expected 132 transfer pairs for frac={frac}, seed={seed}; found {n}")
    return {"rows": len(rows), **{str(k): int(v) for k, v in counts.items()}}


def validate_meta(meta: dict[str, Any]) -> None:
    if len(meta.get("samples", [])) != 12:
        raise RuntimeError(f"Expected 12 donors, found {len(meta.get('samples', []))}")
    if len(meta.get("markers", [])) != 49:
        raise RuntimeError(f"Expected 49 markers, found {len(meta.get('markers', []))}")
    if int(meta.get("nsub", 0)) != 12000:
        raise RuntimeError(f"Expected nsub=12000, found {meta.get('nsub')}")
    if int(meta.get("n_cells_in_atlas", 0)) != 886525:
        raise RuntimeError(f"Expected 886,525 atlas rows, found {meta.get('n_cells_in_atlas')}")


def load_csv(meta: dict[str, Any]) -> pd.DataFrame:
    csv_path = require(DATA_DIR / "data" / "nbm_codex_tabular.csv")
    usecols = [
        "sample",
        "CellID",
        "x",
        "y",
        "label_l1",
        "label_l2",
        "label_coarse",
        "Sex",
        "Age",
        *meta["markers"],
    ]
    df = pd.read_csv(csv_path, usecols=usecols)
    missing_markers = sorted(set(meta["markers"]) - set(df.columns))
    if missing_markers:
        raise RuntimeError(f"CSV is missing markers: {missing_markers}")
    return df


def selected_rows(df: pd.DataFrame, sample: str, rng: np.random.Generator, nsub: int) -> pd.DataFrame:
    donor = df[df["sample"] == sample]
    if len(donor) < nsub:
        raise RuntimeError(f"{sample} has {len(donor)} rows, less than requested nsub={nsub}")
    indices = np.sort(rng.choice(len(donor), size=nsub, replace=False))
    return donor.iloc[indices].copy()


def validate_npz_member(npz: np.lib.npyio.NpzFile, key: str, expected_shape: tuple[int, ...]) -> np.ndarray:
    if key not in npz:
        raise RuntimeError(f"Missing NPZ key: {key}")
    value = npz[key]
    if value.shape != expected_shape:
        raise RuntimeError(f"NPZ key {key} shape {value.shape}, expected {expected_shape}")
    return value


def zip_zarr_store(store_path: Path) -> Path:
    zip_path = store_path.with_suffix(".zarr.zip")
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in sorted(store_path.rglob("*")):
            if item.is_file():
                archive.write(item, Path(store_path.name) / item.relative_to(store_path))
    return zip_path


def build_zarrs(df: pd.DataFrame, meta: dict[str, Any], force: bool) -> list[dict[str, Any]]:
    out_root = GENERATED_DIR / "vitessce"
    if force and out_root.exists():
        shutil.rmtree(out_root)
    out_root.mkdir(parents=True, exist_ok=True)

    markers = list(meta["markers"])
    samples = list(meta["samples"])
    nsub = int(meta["nsub"])
    zarr_stores: list[dict[str, Any]] = []

    for seed in (0, 1):
        rng = np.random.default_rng(seed)
        npz_path = require(DATA_DIR / "data" / f"sub_seed{seed}.npz")
        with np.load(npz_path, allow_pickle=False) as npz:
            for sample in samples:
                selected = selected_rows(df, sample, rng, nsub)
                x_key = f"{sample}|X"
                xy_key = f"{sample}|xy"
                lab_key = f"{sample}|lab"
                X = validate_npz_member(npz, x_key, (nsub, len(markers))).astype(np.float32, copy=False)
                xy = validate_npz_member(npz, xy_key, (nsub, 2)).astype(np.float32, copy=False)
                lab = validate_npz_member(npz, lab_key, (nsub,))

                csv_X = selected[markers].to_numpy(dtype=np.float32)
                csv_xy = selected[["x", "y"]].to_numpy(dtype=np.float32)
                csv_lab = selected["label_l1"].astype(str).to_numpy()
                if not np.allclose(X, csv_X, rtol=1e-5, atol=1e-5, equal_nan=True):
                    raise RuntimeError(f"Marker matrix mismatch for {sample}, seed {seed}")
                if not np.allclose(xy, csv_xy, rtol=1e-4, atol=1e-4, equal_nan=True):
                    raise RuntimeError(f"XY coordinate mismatch for {sample}, seed {seed}")
                if not np.array_equal(lab.astype(str), csv_lab):
                    raise RuntimeError(f"label_l1 mismatch for {sample}, seed {seed}")

                obs = pd.DataFrame(
                    {
                        "cell_id": selected["CellID"].astype(str).to_numpy(),
                        "sample": selected["sample"].astype(str).to_numpy(),
                        "label_l1": selected["label_l1"].astype(str).to_numpy(),
                        "label_l2": selected["label_l2"].astype(str).to_numpy(),
                        "label_coarse": selected["label_coarse"].astype(str).to_numpy(),
                        "sex": selected["Sex"].astype(str).to_numpy(),
                        "age": selected["Age"].to_numpy(),
                        "seed": seed,
                    },
                    index=[f"{sample}::{cell_id}" for cell_id in selected["CellID"].astype(str)],
                )
                var = pd.DataFrame(index=pd.Index(markers, name="index"))
                adata = ad.AnnData(X=X, obs=obs, var=var, obsm={"spatial": xy})
                adata.uns["provenance"] = {
                    "source_csv_sha256": EXPECTED_CSV_SHA256,
                    "source_npz": npz_path.name,
                    "sample": sample,
                    "seed": seed,
                    "n_cells": nsub,
                    "markers": markers,
                }
                store_path = out_root / f"seed{seed}" / f"{sample}.zarr"
                if store_path.exists():
                    shutil.rmtree(store_path)
                adata.write_zarr(store_path)
                zip_path = zip_zarr_store(store_path)
                zarr_stores.append(
                    {
                        "sample": sample,
                        "seed": seed,
                        "path": str(store_path.relative_to(GENERATED_DIR)),
                        "zip_path": str(zip_path.relative_to(GENERATED_DIR)),
                        "n_cells": nsub,
                        "n_markers": len(markers),
                    }
                )
    return zarr_stores


def code_receipts() -> list[dict[str, str]]:
    receipts = []
    for path in sorted((DATA_DIR / "code").glob("*.py")):
        receipts.append({"path": str(path.relative_to(DATA_DIR)), "sha256": sha256(path)})
    return receipts


def build(force: bool) -> None:
    meta_path = require(DATA_DIR / "data" / "prep_meta.json")
    csv_path = require(DATA_DIR / "data" / "nbm_codex_tabular.csv")
    maps_path = require(DATA_DIR / "results" / "maps.json")
    results_path = require(DATA_DIR / "results" / "results_v5.jsonl")
    require(DATA_DIR / "data" / "sub_seed0.npz")
    require(DATA_DIR / "data" / "sub_seed1.npz")
    require(DATA_DIR / "data" / "PROVENANCE.md")

    meta = read_json(meta_path)
    maps = read_json(maps_path)
    results = read_jsonl(results_path)
    validate_meta(meta)
    validate_maps(maps)
    result_counts = validate_results(results)

    actual_csv_sha = sha256(csv_path)
    if actual_csv_sha != EXPECTED_CSV_SHA256:
        raise RuntimeError(f"CSV SHA-256 mismatch: {actual_csv_sha} != {EXPECTED_CSV_SHA256}")

    rds_receipts = check_rds_receipts()
    df = load_csv(meta)
    if len(df) != int(meta["n_cells_in_atlas"]):
        raise RuntimeError(f"CSV row count {len(df)} != expected {meta['n_cells_in_atlas']}")
    if sorted(df["sample"].unique()) != sorted(meta["samples"]):
        raise RuntimeError("CSV sample IDs do not match prep_meta.json")

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    zarr_stores = build_zarrs(df, meta, force=force)
    shutil.copy2(maps_path, GENERATED_DIR / "maps.json")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_dir": str(DATA_DIR),
        "generated_dir": str(GENERATED_DIR),
        "representative_donor": EXPECTED_REPRESENTATIVE,
        "checks": {
            "csv_sha256": {
                "expected": EXPECTED_CSV_SHA256,
                "actual": actual_csv_sha,
                "ok": True,
            },
            "rds_md5": rds_receipts,
            "results": result_counts,
            "maps": {
                "n_exported": len(maps["x"]),
                "label_arrays": len(maps["labels"]),
                "weights": [fmt_weight(float(v)) for v in maps["fracs"]],
            },
        },
        "cohort": {
            "samples": meta["samples"],
            "markers": meta["markers"],
            "n_samples": len(meta["samples"]),
            "n_markers": len(meta["markers"]),
            "n_cells_in_atlas": int(meta["n_cells_in_atlas"]),
            "nsub": int(meta["nsub"]),
        },
        "zarr_stores": zarr_stores,
        "code_receipts": code_receipts(),
    }
    write_json(GENERATED_DIR / "manifest.json", manifest)
    write_json(GENERATED_DIR / "cohort.json", manifest["cohort"])
    print(f"Built portal data in {GENERATED_DIR}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build real-data portal artifacts for XTB CODEX benchmark.")
    parser.add_argument("--force", action="store_true", help="Rebuild existing generated Zarr stores.")
    args = parser.parse_args()
    build(force=args.force)


if __name__ == "__main__":
    main()

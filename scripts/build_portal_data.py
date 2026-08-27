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


def top_counts(series: pd.Series, limit: int = 12) -> list[dict[str, Any]]:
    counts = series.astype(str).value_counts(dropna=False).head(limit)
    total = int(len(series))
    return [
        {
            "label": str(label),
            "count": int(count),
            "fraction": float(count / total) if total else 0.0,
            "is_artifact_or_qc": is_artifact_or_qc_label(str(label)),
        }
        for label, count in counts.items()
    ]


def is_artifact_or_qc_label(label: str) -> bool:
    lowered = label.lower()
    return any(token in lowered for token in ("artifact", "autofluorescent", "undetermined"))


def marker_evidence(df: pd.DataFrame, meta: dict[str, Any], label_column: str) -> list[dict[str, Any]]:
    markers = list(meta["markers"])
    marker_values = df[markers]
    counts = df[label_column].astype(str).value_counts(dropna=False)
    donor_counts = df.groupby(label_column, sort=True)["sample"].nunique()
    grouped = df.groupby(label_column, sort=True)[markers]
    sums = grouped.sum()
    medians = grouped.median()
    q1 = grouped.quantile(0.25)
    q3 = grouped.quantile(0.75)
    total_sums = marker_values.sum()
    total_count = len(df)
    evidence = []

    for label, count in counts.items():
        count = int(count)
        label_sums = sums.loc[label]
        rest_count = total_count - count
        if rest_count <= 0:
            continue
        label_mean = label_sums / count
        rest_mean = (total_sums - label_sums) / rest_count
        delta = label_mean - rest_mean
        top_markers = []
        for marker in delta.sort_values(ascending=False).head(8).index:
            top_markers.append(
                {
                    "marker": marker,
                    "mean_delta_vs_rest": float(delta[marker]),
                    "label_median": float(medians.loc[label, marker]),
                    "label_iqr": [float(q1.loc[label, marker]), float(q3.loc[label, marker])],
                    "rest_mean": float(rest_mean[marker]),
                }
            )
        evidence.append(
            {
                "label": str(label),
                "count": count,
                "fraction": float(count / total_count),
                "donor_count": int(donor_counts.loc[label]),
                "is_artifact_or_qc": is_artifact_or_qc_label(str(label)),
                "top_positive_markers": top_markers,
            }
        )
    return evidence


def analysis_method(results: list[dict[str, Any]], maps_path: Path) -> dict[str, Any]:
    run_meta = next((row for row in results if row.get("kind") == "run_meta"), {})
    return {
        "label": "label_l1",
        "npc": int(run_meta.get("npc", 20)),
        "fixed_resolution": float(run_meta.get("fixed_resolution", 0.5)),
        "neighbors": {
            "n_neighbors": 15,
            "use_rep": "X",
        },
        "leiden": {
            "resolution": float(run_meta.get("fixed_resolution", 0.5)),
            "flavor": "igraph",
            "n_iterations": 2,
            "directed": False,
        },
        "fractions": run_meta.get("fractions", EXPECTED_FRACS),
        "sweep_seeds": run_meta.get("sweep_seeds", [0, 1]),
        "floor_pairs": run_meta.get("floor_pairs", [[101, 202], [303, 404], [505, 606]]),
        "kmeans": {
            "n_init": 4,
            "random_state": "seed",
            "role": "spatial-only and marker-only proxy partitions for diagnostics",
        },
        "results_sha256": sha256(DATA_DIR / "results" / "results_v5.jsonl"),
        "maps_sha256": sha256(maps_path),
        "input_sha256": run_meta.get("input_sha256", EXPECTED_CSV_SHA256),
        "software_versions": run_meta.get("versions", {}),
        "source_command": "xtb_pilot_v5.py writes results_v5.jsonl; export_maps.py writes maps.json; build_portal_data.py verifies and packages portal artifacts.",
    }


def artifact_summary(df: pd.DataFrame) -> dict[str, Any]:
    label_l1 = top_counts(df["label_l1"], limit=50)
    label_coarse = top_counts(df["label_coarse"], limit=50)
    l1_count = sum(item["count"] for item in label_l1 if item["is_artifact_or_qc"])
    coarse_count = sum(item["count"] for item in label_coarse if item["is_artifact_or_qc"])
    total = len(df)
    return {
        "retained_in_benchmark": True,
        "reason": "Artifact/QC annotations are retained because the benchmark compares partitions against the deposited atlas metadata as-is.",
        "label_l1_count": int(l1_count),
        "label_l1_fraction": float(l1_count / total),
        "label_coarse_count": int(coarse_count),
        "label_coarse_fraction": float(coarse_count / total),
    }


def transfer_floor_deltas(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deltas = []
    for frac in EXPECTED_FRACS:
        transfer_values = [
            float(row["stability_ari"])
            for row in results
            if row.get("kind") == "transfer"
            and row.get("frac") is not None
            and math.isclose(float(row.get("frac")), frac)
        ]
        floor_values = [
            float(row["ari_self"])
            for row in results
            if row.get("kind") == "floor"
            and row.get("frac") is not None
            and math.isclose(float(row.get("frac")), frac)
        ]
        if not transfer_values or not floor_values:
            raise RuntimeError(f"Missing transfer/floor values for frac={frac}")
        transfer_mean = float(np.mean(transfer_values))
        floor_mean = float(np.mean(floor_values))
        deltas.append(
            {
                "frac": frac,
                "transfer_mean": transfer_mean,
                "floor_mean": floor_mean,
                "transfer_minus_floor": transfer_mean - floor_mean,
            }
        )
    return deltas


def paper_tool_parity() -> dict[str, Any]:
    return {
        "source": "Scanned from the public spatial-bonemarrow-atlas repository README and analysis scripts; portal status is limited to this local benchmark.",
        "groups": [
            {
                "status": "Used directly by portal",
                "summary": "Packages and file formats imported by the local API/build or front-end runtime.",
                "tools": [
                    {"name": "CODEX", "role": "Protein-marker imaging modality for the synced normal-bone-marrow table."},
                    {"name": "AnnData/Zarr", "role": "Generated per-donor stores consumed by Vitessce."},
                    {"name": "Vitessce", "role": "Interactive spatial viewer for donor subsamples."},
                    {"name": "numpy/pandas", "role": "CSV, NPZ, and metric artifact verification and packaging."},
                    {"name": "FastAPI/React/Vite", "role": "Local portal API and front-end shell; not part of the paper analysis."},
                ],
            },
            {
                "status": "Synced benchmark receipt",
                "summary": "Tools used by the benchmark code that produced synced results_v5.jsonl and maps.json artifacts.",
                "tools": [
                    {"name": "scikit-learn", "role": "StandardScaler, PCA, KMeans, and adjusted Rand index in the benchmark receipt code."},
                    {"name": "scanpy/Leiden", "role": "Neighbor graph construction and Leiden clustering in the benchmark receipt code."},
                    {"name": "igraph/leidenalg", "role": "Leiden backend used by the benchmark receipt code."},
                ],
            },
            {
                "status": "Upstream/source artifact",
                "summary": "Paper tools represented through the deposited Seurat-derived CODEX artifacts and publisher annotations, but not rerun by this portal.",
                "tools": [
                    {"name": "Seurat", "role": "Original processed CODEX data are deposited as Seurat objects; this portal consumes the derived tabular export."},
                    {"name": "tidyverse/readr/dplyr/tidyr/tibble", "role": "Used throughout the paper repository's R analysis and preprocessing scripts."},
                    {"name": "ggplot2/patchwork/ComplexHeatmap/pheatmap", "role": "Paper plotting and heatmap generation; portal redraws summaries in React."},
                    {"name": "DeepCell/Mesmer", "role": "Cell segmentation context in the paper source; the portal consumes already segmented cell rows."},
                    {"name": "MCMICRO-style quantification outputs", "role": "Paper scripts reference segmentation/quantification outputs; this portal consumes their downstream cell table."},
                ],
            },
            {
                "status": "Out of scope for this portal",
                "summary": "Broader atlas analyses from the paper that are listed for transparency but intentionally not claimed by the benchmark UI.",
                "tools": [
                    {"name": "scRNA-seq atlas generation", "role": "The portal is CODEX-only and does not rebuild the transcriptomic atlas."},
                    {"name": "QuPath", "role": "Mask and annotation workflows from the source analyses are not rerun locally."},
                    {"name": "wsireg", "role": "Whole-slide registration utility found in paper CODEX support scripts; not rerun locally."},
                    {"name": "spatstat/sf/nngeo/imcRtools/SingleCellExperiment", "role": "Spatial geometry, distance, and ligand-receptor distance workflows are not rerun for this benchmark."},
                    {"name": "CytoTRACE", "role": "Paper scRNA differentiation analysis; no CytoTRACE result is displayed or recomputed."},
                    {"name": "CellChat", "role": "Paper ligand-receptor signaling analysis; no signaling or causal niche claim is made here."},
                    {"name": "RPCA/reference mapping", "role": "Paper AML/NSM mapping workflow; this portal stays on normal-marrow CODEX benchmark artifacts."},
                    {"name": "AML/NSM neighborhood analysis", "role": "Disease and neighborhood paper analyses are not included in this normal benchmark portal."},
                    {"name": "RNA/protein correlation and ligand-receptor CODEX distance analysis", "role": "Integrated atlas analyses are not part of the local stability benchmark."},
                ],
            },
        ],
    }


def build_biology_summary(df: pd.DataFrame, meta: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    marker_groups = [
        {
            "name": "Hematopoietic progenitor and stem-associated",
            "markers": ["CD34", "CD117", "SPINK2", "CD38", "CD90", "CD49F"],
        },
        {
            "name": "Myeloid, monocyte, and macrophage",
            "markers": ["MPO", "CD33", "CD15", "CD11B", "CD11C", "CD14", "CD68", "CD163", "HLA-DR"],
        },
        {
            "name": "B, plasma, and T lymphoid",
            "markers": ["CD19", "CD79A", "PAX5", "CD10", "CD138", "CD3e", "CD4", "CD8"],
        },
        {
            "name": "Erythroid and megakaryocytic",
            "markers": ["GATA1", "GYPC", "CD71", "CD61"],
        },
        {
            "name": "Stromal, vascular, and niche",
            "markers": ["ASMA", "VIM", "FOXC1", "VCAM1", "CD146", "VECAD", "PDPN", "CXCL12", "TGFB1", "CD271"],
        },
        {
            "name": "Other measured proteins",
            "markers": ["PLP1", "BCL2", "HIF1A", "OXPHOS", "CD44", "CD45", "CD45RA", "CD123", "CD141", "BCAT", "CXCR4", "MastCellTryptase"],
        },
    ]
    markers = set(meta["markers"])
    sample_counts = df.groupby("sample", sort=True).size()
    sample_meta = df.groupby("sample", sort=True)[["Sex", "Age"]].first()
    samples = []
    for sample, count in sample_counts.items():
        subset = df[df["sample"] == sample]
        samples.append(
            {
                "sample": str(sample),
                "cell_count": int(count),
                "sex": str(sample_meta.loc[sample, "Sex"]),
                "age": int(sample_meta.loc[sample, "Age"]),
                "top_label_l1": top_counts(subset["label_l1"], limit=5),
            }
        )

    deltas = transfer_floor_deltas(results)
    return {
        "dataset": {
            "title": "Derived tabular export from Processed CODEX Data (Seurat Objects)",
            "deposited_title": "Processed CODEX Data (Seurat Objects)",
            "doi": "10.25452/figshare.plus.25127657.v1",
            "collection_doi": "10.25452/figshare.plus.c.7174914",
            "license": "CC0 1.0 Universal",
            "posted": "2024-04-12T20:19:57Z",
            "modality": "CODEX spatial proteomic imaging",
            "source_rows": int(len(df)),
            "subsampled_cells_per_donor": int(meta["nsub"]),
            "markers_used": int(len(meta["markers"])),
        },
        "paper": {
            "title": "Mapping the cellular biogeography of human bone marrow niches using single-cell transcriptomics and proteomic imaging",
            "journal": "Cell",
            "year": 2024,
            "doi": "10.1016/j.cell.2024.04.013",
            "pubmed": "38714197",
            "reported_scope": "The paper describes a spatially resolved multiomic human bone-marrow atlas combining scRNA-seq and CODEX proteomic imaging.",
        },
        "annotations": {
            "label_l1": top_counts(df["label_l1"], limit=18),
            "label_l2": top_counts(df["label_l2"], limit=18),
            "label_coarse": top_counts(df["label_coarse"], limit=18),
        },
        "annotation_evidence": {
            "label_l1": marker_evidence(df, meta, "label_l1"),
        },
        "artifact_summary": artifact_summary(df),
        "samples": samples,
        "marker_groups": [
            {**group, "markers": [marker for marker in group["markers"] if marker in markers]}
            for group in marker_groups
        ],
        "pipeline": {
            "subsample": "Two independent 12,000-cell subsamples are used per donor, for seeds 0 and 1.",
            "features": "The clustering feature matrix starts from the 49 synced CODEX protein-marker intensity columns.",
            "embedding": "Marker intensities are standardized, reduced to 20 principal components, then concatenated with standardized x/y coordinates scaled to the target spatial variance share.",
            "clustering": "Leiden clustering is run at fixed resolution 0.5.",
            "native": "Native ARI compares each donor's partition with publisher label_l1 annotations from the deposited atlas metadata.",
            "transfer": "Transfer ARI compares a destination donor's native partition with the partition produced on that destination using a source donor's frozen marker scaler and PCA.",
            "floor": "The stochastic floor reclusters the same donor embedding under paired random seeds and compares those partitions by adjusted Rand index.",
        },
        "metric_definitions": {
            "ari": "Adjusted Rand index measures partition agreement; it is not a cell-type truth score or diagnostic accuracy.",
            "bsi": "Map BSI is a representative-donor diagnostic: ARI(spatial-only proxy, mixed partition) divided by the sum of spatial-only and marker-only proxy ARIs after clipping negative proxy ARIs to zero.",
            "transfer_minus_floor": "Mean transfer ARI minus mean same-donor stochastic-floor ARI at the same spatial weight.",
        },
        "transfer_floor": {
            "deltas": deltas,
            "all_transfer_below_floor": all(item["transfer_minus_floor"] < 0 for item in deltas),
        },
        "paper_tool_parity": paper_tool_parity(),
        "story": {
            "question": "How do protein-defined marrow cell states and tissue position affect clustering reproducibility across donors?",
            "biological_material": "Each cell carries multiplexed antibody intensity, x/y tissue position, and publisher-derived marrow annotations.",
            "benchmark_reading": "The transfer score is a method-stability readout across donors; it is not a clinical or causal biology claim.",
            "portal_scope": "This portal uses the normal bone-marrow CODEX-derived tabular export only; it does not rerun the paper's scRNA-seq integration, signaling, AML, or neighborhood analyses.",
            "atlas_context": "This benchmark uses the normal-bone-marrow CODEX-derived tabular export from the Bandyopadhyay et al. human bone-marrow atlas. The paper combines single-cell transcriptomics with CODEX proteomic imaging, but this portal analyzes only the CODEX protein-marker table, cell coordinates, and publisher annotations.",
            "main_result": "Across this normal-marrow CODEX case study, donor-transfer agreement remains below the same-donor stochastic floor at all seven spatial weights. Treat this as a stability audit, not evidence of a general transferable biological model.",
            "marker_scope": "The portal uses the 49 marker columns present in the synced tabular export after preprocessing, not every antibody/channel described across the full atlas resources.",
        },
    }


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
    biology = build_biology_summary(df, meta, results)
    zarr_stores = build_zarrs(df, meta, force=force)
    shutil.copy2(maps_path, GENERATED_DIR / "maps.json")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_dir": str(DATA_DIR),
        "generated_dir": str(GENERATED_DIR),
        "representative_donor": EXPECTED_REPRESENTATIVE,
        "analysis_method": analysis_method(results, maps_path),
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
        "biology": biology,
        "zarr_stores": zarr_stores,
        "code_receipts": code_receipts(),
    }
    write_json(GENERATED_DIR / "manifest.json", manifest)
    write_json(GENERATED_DIR / "cohort.json", manifest["cohort"])
    write_json(GENERATED_DIR / "biology.json", biology)
    print(f"Built portal data in {GENERATED_DIR}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build real-data portal artifacts for XTB CODEX benchmark.")
    parser.add_argument("--force", action="store_true", help="Rebuild existing generated Zarr stores.")
    args = parser.parse_args()
    build(force=args.force)


if __name__ == "__main__":
    main()

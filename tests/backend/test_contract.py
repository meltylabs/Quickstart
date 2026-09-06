from __future__ import annotations

import json
import math
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import app


client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]
EXPECTED_FRACS = [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9]


def test_health_reports_state() -> None:
    payload = client.get("/api/health").json()
    assert payload["status"] in {"ok", "missing"}
    assert "data_dir" in payload
    assert "generated_dir" in payload
    if payload["status"] == "missing":
        assert payload["missing"]


def require_ready() -> None:
    payload = client.get("/api/health").json()
    assert payload["status"] == "ok", payload


def test_cohort_contract_when_ready() -> None:
    require_ready()
    payload = client.get("/api/cohort").json()
    assert payload["n_samples"] == 12
    assert payload["n_markers"] == 49
    assert payload["nsub"] == 12000
    assert payload["n_cells_in_atlas"] == 886525
    assert "SB67_NBM37_H35_CODEX_Mesmer" in payload["samples"]


def test_biology_contract_when_ready() -> None:
    require_ready()
    payload = client.get("/api/biology").json()
    assert payload["dataset"]["modality"] == "CODEX spatial proteomic imaging"
    assert payload["dataset"]["source_rows"] == 886525
    assert payload["dataset"]["doi"] == "10.25452/figshare.plus.25127657.v1"
    assert payload["dataset"]["collection_doi"] == "10.25452/figshare.plus.c.7174914"
    assert payload["paper"]["doi"] == "10.1016/j.cell.2024.04.013"
    assert "normal bone-marrow CODEX-derived tabular export only" in payload["story"]["portal_scope"]
    assert payload["story"]["main_result"].startswith("Across this normal-marrow CODEX case study")
    assert payload["transfer_floor"]["all_transfer_below_floor"] is True
    assert len(payload["transfer_floor"]["deltas"]) == 7
    assert payload["artifact_summary"]["retained_in_benchmark"] is True
    assert len(payload["samples"]) == 12
    assert len(payload["annotations"]["label_l1"]) >= 10
    assert payload["annotations"]["label_l1"][0]["label"] == "Myeloid"
    assert payload["annotations"]["label_l1"][0]["is_artifact_or_qc"] is False
    assert any(item["is_artifact_or_qc"] for item in payload["annotations"]["label_l1"])
    assert payload["annotation_evidence"]["label_l1"][0]["top_positive_markers"]
    assert any(group["name"].startswith("Stromal") for group in payload["marker_groups"])
    assert payload["pipeline"]["features"].startswith("The clustering feature matrix starts from the 49 synced CODEX protein-marker")
    assert "Adjusted Rand index measures partition agreement" in payload["metric_definitions"]["ari"]
    parity = payload["paper_tool_parity"]["groups"]
    assert [group["status"] for group in parity] == [
        "Used directly by portal",
        "Synced benchmark receipt",
        "Upstream/source artifact",
        "Out of scope for this portal",
    ]
    parity_tools = {
        tool["name"]: group["status"]
        for group in parity
        for tool in group["tools"]
    }
    assert parity_tools["Vitessce"] == "Used directly by portal"
    assert parity_tools["scanpy/Leiden"] == "Synced benchmark receipt"
    assert parity_tools["Seurat"] == "Upstream/source artifact"
    assert parity_tools["CellChat"] == "Out of scope for this portal"
    assert parity_tools["CytoTRACE"] == "Out of scope for this portal"


def test_sweep_contract_when_ready() -> None:
    require_ready()
    payload = client.get("/api/sweep").json()
    assert payload["counts"]["transfer"] == 1848
    assert payload["counts"]["native"] == 168
    assert payload["counts"]["floor"] == 324
    assert len(payload["weights"]) == 7
    assert [item["frac"] for item in payload["weights"]] == EXPECTED_FRACS
    for item in payload["weights"]:
        assert item["transfer_pairs_per_seed"]["0"] == 132
        assert item["transfer_pairs_per_seed"]["1"] == 132
        assert item["transfer_minus_floor"] < 0

    rows = [
        json.loads(line)
        for line in (ROOT / ".context" / "xtb-data" / "results" / "results_v5.jsonl").read_text().splitlines()
        if line.strip()
    ]
    first = payload["weights"][0]
    native = [row["ari_vs_author"] for row in rows if row.get("kind") == "native" and row.get("frac") == first["frac"]]
    transfer = [row["stability_ari"] for row in rows if row.get("kind") == "transfer" and row.get("frac") == first["frac"]]
    floor = [row["ari_self"] for row in rows if row.get("kind") == "floor" and row.get("frac") == first["frac"]]
    assert math.isclose(first["native_mean"], sum(native) / len(native))
    assert math.isclose(first["transfer_stability_mean"], sum(transfer) / len(transfer))
    assert math.isclose(first["stochastic_floor_mean"], sum(floor) / len(floor))


def test_transfer_contract_when_ready() -> None:
    require_ready()
    for frac in EXPECTED_FRACS:
        for seed in (0, 1):
            payload = client.get(f"/api/transfer?frac={frac}&seed={seed}").json()
            assert payload["count"] == 132
            assert len(payload["rows"]) == 132
            assert all(0 <= row["realised_share"] <= 1 for row in payload["rows"])

    invalid = client.get("/api/transfer?frac=0.03&seed=0")
    assert invalid.status_code == 400


def test_maps_contract_when_ready() -> None:
    require_ready()
    payload = client.get("/api/maps").json()
    assert payload["donor"] == "SB67_NBM37_H35_CODEX_Mesmer"
    assert len(payload["x"]) == 3000
    assert len(payload["y"]) == 3000
    assert len(payload["labels"]) == 35
    assert set(payload["label_lengths"].values()) == {3000}
    expected = {
        f"{prefix}{str(frac).rstrip('0').rstrip('.')}"
        for frac in (0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9)
        for prefix in ("m", "s", "e", "a", "b")
    }
    assert set(payload["labels"]) == expected


def test_vitessce_config_when_ready() -> None:
    require_ready()
    payload = client.get("/vitessce/config?sample=SB67_NBM37_H35_CODEX_Mesmer&seed=0").json()
    assert payload["datasets"][0]["files"][0]["fileType"] == "anndata.zarr.zip"
    assert payload["datasets"][0]["files"][0]["url"].endswith(
        "/SB67_NBM37_H35_CODEX_Mesmer.zarr.zip"
    )


def test_provenance_exposes_method_receipts_when_ready() -> None:
    require_ready()
    payload = client.get("/api/provenance").json()
    method = payload["analysis_method"]
    assert method["label"] == "label_l1"
    assert method["npc"] == 20
    assert method["fixed_resolution"] == 0.5
    assert method["neighbors"]["n_neighbors"] == 15
    assert method["leiden"]["flavor"] == "igraph"
    assert len(method["results_sha256"]) == 64
    assert len(method["maps_sha256"]) == 64

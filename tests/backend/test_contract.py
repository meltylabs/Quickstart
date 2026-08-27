from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app import app


client = TestClient(app)


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
    assert len(payload["samples"]) == 12
    assert len(payload["annotations"]["label_l1"]) >= 10
    assert payload["annotations"]["label_l1"][0]["label"] == "Myeloid"
    assert any(group["name"].startswith("Stromal") for group in payload["marker_groups"])


def test_sweep_contract_when_ready() -> None:
    require_ready()
    payload = client.get("/api/sweep").json()
    assert payload["counts"]["transfer"] == 1848
    assert payload["counts"]["native"] == 168
    assert payload["counts"]["floor"] == 324
    assert len(payload["weights"]) == 7
    for item in payload["weights"]:
        assert item["transfer_pairs_per_seed"]["0"] == 132
        assert item["transfer_pairs_per_seed"]["1"] == 132


def test_transfer_contract_when_ready() -> None:
    require_ready()
    for frac in (0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9):
        for seed in (0, 1):
            payload = client.get(f"/api/transfer?frac={frac}&seed={seed}").json()
            assert payload["count"] == 132
            assert len(payload["rows"]) == 132


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

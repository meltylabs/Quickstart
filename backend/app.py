from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import store


app = FastAPI(
    title="XTB CODEX Bone-Marrow Portal API",
    version="0.1.0",
    description="Local API backed by synced CODEX normal bone-marrow benchmark artifacts.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8912",
        "http://localhost:8912",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_origin_regex=r"https?://(127\.0\.0\.1|localhost):\d+",
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

generated_dir = Path(store.GENERATED_DIR)
generated_dir.mkdir(parents=True, exist_ok=True)
app.mount("/data/generated", StaticFiles(directory=generated_dir), name="generated-data")


def unavailable(exc: store.DataUnavailable) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


@app.get("/api/health")
def health() -> dict:
    return store.health_report()


@app.get("/api/provenance")
def provenance() -> dict:
    try:
        return store.provenance()
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc


@app.get("/api/cohort")
def cohort() -> dict:
    try:
        return store.cohort()
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc


@app.get("/api/biology")
def biology() -> dict:
    try:
        return store.biology()
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc


@app.get("/api/sweep")
def sweep() -> dict:
    try:
        return store.sweep_summary()
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc


@app.get("/api/transfer")
def transfer(
    frac: float = Query(..., ge=0.0, le=1.0),
    seed: int = Query(0, ge=0, le=1),
) -> dict:
    try:
        return store.transfer(frac=frac, seed=seed)
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc


@app.get("/api/maps")
def maps() -> dict:
    try:
        return store.maps_payload()
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc


@app.get("/vitessce/config")
def vitessce_config(request: Request, sample: str | None = None, seed: int = 0) -> dict:
    try:
        config = store.vitessce_config(sample=sample, seed=seed)
        file_config = config["datasets"][0]["files"][0]
        file_config["url"] = f"{str(request.base_url).rstrip('/')}{file_config['url']}"
        return config
    except store.DataUnavailable as exc:
        raise unavailable(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

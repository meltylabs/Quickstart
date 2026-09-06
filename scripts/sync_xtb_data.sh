#!/usr/bin/env bash
set -euo pipefail

REMOTE="${XTB_REMOTE:-ohsu-ec2:/data/xtb_pilot_2026-08-25}"
DATA_DIR="${XTB_DATA_DIR:-.context/xtb-data}"
WITH_RDS=0

for arg in "$@"; do
  case "$arg" in
    --with-rds)
      WITH_RDS=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

copy_one() {
  local rel="$1"
  mkdir -p "$DATA_DIR/$(dirname "$rel")"
  rsync -av "${REMOTE%/}/$rel" "$DATA_DIR/$rel"
}

mkdir -p "$DATA_DIR/data" "$DATA_DIR/results" "$DATA_DIR/code"

copy_one "data/nbm_codex_tabular.csv"
copy_one "data/prep_meta.json"
copy_one "data/sub_seed0.npz"
copy_one "data/sub_seed1.npz"
copy_one "data/PROVENANCE.md"
copy_one "data/NBM.md5"
copy_one "results/results_v5.jsonl"
copy_one "results/maps.json"
copy_one "code/v5_prep.py"
copy_one "code/v5_worker.py"
copy_one "code/xtb_pilot_v5.py"
copy_one "code/export_maps.py"

if [[ "$WITH_RDS" == "1" ]]; then
  copy_one "data/NBM_CODEX_Atlas_Seurat.rds"
  copy_one "data/AML_NSM_RefMap_Seurat.rds"
fi

echo "Synced XTB CODEX artifacts into $DATA_DIR"

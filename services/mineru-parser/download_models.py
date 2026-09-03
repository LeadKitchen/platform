"""Materialize the exact MinerU model snapshots used by the image."""

import json
from pathlib import Path

from huggingface_hub import snapshot_download

MODEL_ROOT = Path("/app/models")
PIPELINE_REPO = "opendatalab/PDF-Extract-Kit-1.0"
PIPELINE_REVISION = "ed6b654c018d742e65a17671e379c5e6ecc87ec9"
VLM_REPO = "opendatalab/MinerU2.5-Pro-2605-1.2B"
VLM_REVISION = "bff20d4ae2bf202df9f45284b4d43681555a97ed"
PIPELINE_PATHS = (
    "models/Layout/PP-DocLayoutV2",
    "models/MFR/unimernet_hf_small_2503",
    "models/MFR/pp_formulanet_plus_m",
    "models/OCR/paddleocr_torch",
    "models/TabRec/SlanetPlus/slanet-plus.onnx",
    "models/TabRec/UnetStructure/unet.onnx",
    "models/TabCls/paddle_table_cls/PP-LCNet_x1_0_table_cls.onnx",
)


def main() -> None:
    pipeline_dir = MODEL_ROOT / "pipeline"
    vlm_dir = MODEL_ROOT / "vlm"
    pipeline_patterns = [
        pattern
        for path in PIPELINE_PATHS
        for pattern in (path, f"{path}/*")
    ]
    snapshot_download(
        repo_id=PIPELINE_REPO,
        revision=PIPELINE_REVISION,
        allow_patterns=pipeline_patterns,
        local_dir=pipeline_dir,
    )
    snapshot_download(
        repo_id=VLM_REPO,
        revision=VLM_REVISION,
        local_dir=vlm_dir,
    )
    Path("/app/mineru.json").write_text(
        json.dumps(
            {
                "models-dir": {
                    "pipeline": str(pipeline_dir),
                    "vlm": str(vlm_dir),
                },
                "model-source": "local",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

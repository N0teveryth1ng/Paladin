"""Export the two JSON Schema artifacts.

* architecture.generation.schema.json -- the contract the AI must satisfy.
  Generated from ArchitectureDraft, so it contains no prompt, schema_version,
  domain or meta.
* architecture.stored.schema.json -- the full record after the harness injects
  the envelope.

Run from the backend directory:  python -m app.model.export_schema
"""

from __future__ import annotations

import json
from pathlib import Path

from .architecture import Architecture, ArchitectureDraft

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_DIR = REPO_ROOT / "schema"

GENERATION_SCHEMA_PATH = SCHEMA_DIR / "architecture.generation.schema.json"
STORED_SCHEMA_PATH = SCHEMA_DIR / "architecture.stored.schema.json"

JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
GENERATION_SCHEMA_ID = "https://paladin.local/schema/architecture.generation.schema.json"
STORED_SCHEMA_ID = "https://paladin.local/schema/architecture.stored.schema.json"


def render_schema(schema: dict) -> str:
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def build_generation_schema() -> dict:
    schema = ArchitectureDraft.model_json_schema(mode="validation", by_alias=True)
    schema["$schema"] = JSON_SCHEMA_DIALECT
    schema["$id"] = GENERATION_SCHEMA_ID
    schema["title"] = "ArchitectureDraft"
    schema["description"] = (
        "The architecture graph emitted by the model. Structure and meaning only: "
        "no coordinates, sizes or styling. The harness injects schema_version, "
        "prompt, domain and meta afterwards."
    )
    return schema


def build_stored_schema() -> dict:
    schema = Architecture.model_json_schema(mode="validation", by_alias=True)
    schema["$schema"] = JSON_SCHEMA_DIALECT
    schema["$id"] = STORED_SCHEMA_ID
    schema["title"] = "Architecture"
    schema["description"] = (
        "The stored architecture record: the draft plus the run envelope injected "
        "by the harness."
    )
    return schema


def write_schemas(target_dir: Path = SCHEMA_DIR) -> list[Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, schema in (
        ("architecture.generation.schema.json", build_generation_schema()),
        ("architecture.stored.schema.json", build_stored_schema()),
    ):
        path = target_dir / name
        path.write_text(render_schema(schema), encoding="utf-8", newline="\n")
        written.append(path)
    return written


def main() -> int:
    for path in write_schemas():
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Schema artifact tests: validity, envelope separation, no geometry, no drift."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jsonschema
import pytest

from app.model import Architecture, ArchitectureDraft, ComponentType, ConnectionType
from app.model.export_schema import (
    GENERATION_SCHEMA_PATH,
    STORED_SCHEMA_PATH,
    build_generation_schema,
    build_stored_schema,
    render_schema,
)

FIXTURES = Path(__file__).parent / "fixtures"

DRAFT_KEYS = {
    "title",
    "summary",
    "requirements",
    "components",
    "connections",
    "groups",
    "assumptions",
    "flags",
}
ENVELOPE_KEYS = {"schema_version", "prompt", "domain", "meta"}

GEOMETRY_OR_STYLE_KEYS = {
    "x",
    "y",
    "position",
    "width",
    "height",
    "color",
    "colour",
    "style",
    "layout",
    "fill",
    "stroke",
    "fontSize",
    "zIndex",
}


def load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def property_names(node: Any) -> set[str]:
    """Every property name declared anywhere in the schema."""
    found: set[str] = set()
    if isinstance(node, dict):
        properties = node.get("properties")
        if isinstance(properties, dict):
            found.update(properties)
        for value in node.values():
            found |= property_names(value)
    elif isinstance(node, list):
        for value in node:
            found |= property_names(value)
    return found


def all_keys(node: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(node, dict):
        found.update(node)
        for value in node.values():
            found |= all_keys(value)
    elif isinstance(node, list):
        for value in node:
            found |= all_keys(value)
    return found


# ---------------------------------------------------------------------
def test_committed_schemas_match_regenerated_output() -> None:
    assert GENERATION_SCHEMA_PATH.exists(), "generation schema is not committed"
    assert STORED_SCHEMA_PATH.exists(), "stored schema is not committed"

    assert GENERATION_SCHEMA_PATH.read_text(encoding="utf-8") == render_schema(
        build_generation_schema()
    ), "architecture.generation.schema.json is stale; rerun the exporter"
    assert STORED_SCHEMA_PATH.read_text(encoding="utf-8") == render_schema(
        build_stored_schema()
    ), "architecture.stored.schema.json is stale; rerun the exporter"


# ---------------------------------------------------------------------
@pytest.mark.parametrize("builder", [build_generation_schema, build_stored_schema])
def test_schemas_are_valid_draft_2020_12(builder: Any) -> None:
    schema = builder()
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    jsonschema.Draft202012Validator.check_schema(schema)


# ---------------------------------------------------------------------
def test_generation_schema_excludes_the_envelope() -> None:
    schema = build_generation_schema()

    assert set(schema["properties"]) == DRAFT_KEYS
    assert ENVELOPE_KEYS.isdisjoint(property_names(schema)), (
        "the AI must never see prompt, schema_version, domain or meta"
    )


def test_stored_schema_includes_the_envelope() -> None:
    schema = build_stored_schema()

    assert set(schema["properties"]) == DRAFT_KEYS | ENVELOPE_KEYS
    assert ENVELOPE_KEYS <= property_names(schema)


# ---------------------------------------------------------------------
def test_component_type_enum_has_exactly_fourteen_values() -> None:
    schema = build_generation_schema()
    node = schema["$defs"]["ComponentType"]

    assert len(node["enum"]) == 14
    assert set(node["enum"]) == {member.value for member in ComponentType}


def test_connection_type_enum_has_exactly_two_values() -> None:
    schema = build_generation_schema()
    node = schema["$defs"]["ConnectionType"]

    assert node["enum"] == ["sync", "async"]
    assert set(node["enum"]) == {member.value for member in ConnectionType}


# ---------------------------------------------------------------------
@pytest.mark.parametrize("builder", [build_generation_schema, build_stored_schema])
def test_no_geometry_or_styling_keys_anywhere(builder: Any) -> None:
    schema = builder()
    forbidden = all_keys(schema) & GEOMETRY_OR_STYLE_KEYS
    assert not forbidden, f"schema carries geometry or styling keys: {sorted(forbidden)}"


# ---------------------------------------------------------------------
def test_generation_schema_accepts_a_real_draft() -> None:
    schema = build_generation_schema()
    draft = ArchitectureDraft.model_validate(load("full_coverage_architecture.json"))
    jsonschema.Draft202012Validator(schema).validate(
        draft.model_dump(mode="json", by_alias=True)
    )


def test_stored_schema_accepts_a_real_record() -> None:
    schema = build_stored_schema()
    record = {
        **load("small_architecture.json"),
        "schema_version": "1.0",
        "prompt": "Design a URL shortener that runs in a single region but survives region loss.",
        "domain": "web_backend",
        "meta": {
            "provider": "zhipu",
            "model": "glm-4-flash",
            "base_url": "https://open.bigmodel.cn/api/paas/v4",
            "generated_at": "2026-11-12T09:00:00Z",
        },
    }
    Architecture.model_validate(record)
    jsonschema.Draft202012Validator(schema).validate(record)


# ---------------------------------------------------------------------
def test_generation_schema_rejects_an_envelope_field() -> None:
    schema = build_generation_schema()
    payload = {**load("small_architecture.json"), "prompt": "leaked"}

    with pytest.raises(jsonschema.ValidationError):
        jsonschema.Draft202012Validator(schema).validate(payload)

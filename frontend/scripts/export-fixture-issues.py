#!/usr/bin/env python3
"""Export validate_graph() output for the committed frontend fixtures.

One-way, dev-only artifact generator. It reads the frozen backend model and
validators and writes JSON into frontend/src/fixtures/issues/. It is never
imported by the frontend runtime and never modifies a fixture.

Usage (normally through scripts/export-issues.mjs):
    python export-fixture-issues.py small_architecture full_coverage_architecture
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent
REPO = FRONTEND.parent
BACKEND = REPO / "backend"
FIXTURES = FRONTEND / "src" / "fixtures"
OUT_DIR = FIXTURES / "issues"

sys.path.insert(0, str(BACKEND))

from app.model.architecture import ArchitectureDraft  # noqa: E402
from app.validation.rules import load_rules  # noqa: E402
from app.validation.validators import validate_graph  # noqa: E402


def export_one(name: str, rules_version: str) -> dict:
    fixture_path = FIXTURES / f"{name}.json"
    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    draft = ArchitectureDraft.model_validate(data)
    issues = validate_graph(draft)

    payload = {
        "fixture": f"{name}.json",
        "rules_version": rules_version,
        "issues": [
            {
                "kind": issue.kind.value,
                "severity": issue.severity.value,
                "element_id": issue.element_id,
                "message": issue.message,
            }
            for issue in issues
        ],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{name}.issues.json"
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return payload


def main(argv: list[str]) -> int:
    names = argv[1:]
    if not names:
        print("usage: export-fixture-issues.py <fixture-name> [...]", file=sys.stderr)
        return 2

    rules_version = load_rules().rules_version
    for name in names:
        payload = export_one(name, rules_version)
        print(f"{payload['fixture']}: {len(payload['issues'])} issues")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

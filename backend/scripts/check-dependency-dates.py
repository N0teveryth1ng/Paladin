"""Report PyPI publish dates for exact-pinned direct Python dependencies.

Reads ``backend/pyproject.toml`` and queries the PyPI JSON API. It never
installs, upgrades or changes any dependency. A version published less than
14 days ago (or one that cannot be verified) is a failure.
"""

from __future__ import annotations

import json
import re
import sys
import tomllib
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

MIN_AGE_DAYS = 14
PYPI_URL = "https://pypi.org/pypi/{name}/{version}/json"
REQUIREMENT = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([^\s;]+)")

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def normalise(name: str) -> str:
    """PEP 503 normalisation: hyphens/underscores/dots collapse to '-'."""

    return re.sub(r"[-_.]+", "-", name).lower()


def direct_dependencies() -> list[tuple[str, str]]:
    project = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["project"]
    groups: list[tuple[str, list[str]]] = [("dependencies", project.get("dependencies", []))]
    for group, entries in project.get("optional-dependencies", {}).items():
        groups.append((group, entries))

    pinned: list[tuple[str, str]] = []
    seen: set[str] = set()
    for group, entries in groups:
        for entry in entries:
            match = REQUIREMENT.match(entry)
            if match is None:
                print(f"WARNING ({group}): {entry!r} is not an exact pin")
                continue
            name, version = match.group(1), match.group(2)
            key = normalise(name)
            if key in seen:
                continue
            seen.add(key)
            pinned.append((name, version))
    return pinned


def publish_date(name: str, version: str) -> str:
    url = PYPI_URL.format(name=normalise(name), version=version)
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = json.load(response)
    uploads = [item["upload_time_iso_8601"] for item in payload.get("urls", [])]
    if not uploads:
        raise ValueError("PyPI reported no release files for this version")
    return min(uploads)


def main() -> int:
    today = datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=MIN_AGE_DAYS)
    print(f"Today (UTC): {today.isoformat()}")
    print(f"Minimum allowed publish date ({MIN_AGE_DAYS} days old): {cutoff.isoformat()}")

    failures = 0
    for name, version in direct_dependencies():
        try:
            uploaded = publish_date(name, version)
            published = datetime.fromisoformat(uploaded.replace("Z", "+00:00")).date()
            status = "OK" if published <= cutoff else "TOO NEW"
            if status == "TOO NEW":
                failures += 1
            print(f"{name}=={version}: published {published.isoformat()} -> {status}")
        except Exception as error:  # network/JSON errors are reported, never hidden
            failures += 1
            print(f"{name}=={version}: published unknown -> ERROR ({error})")

    if failures:
        print(f"FAILED: {failures} direct dependency/ies are too new or unverifiable")
        return 1
    print("PASS: every direct dependency is at least 14 days old")
    return 0


if __name__ == "__main__":
    sys.exit(main())

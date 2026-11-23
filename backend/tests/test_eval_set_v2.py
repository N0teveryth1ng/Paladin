"""Structural validation and authoring-independence checks for eval set v2.0."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pytest

from app.eval.models import EvalSet, EvalPrompt
from app.eval.predicates import COMPONENT_TYPE_LABELS, parse

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_SET_V2_PATH = REPO_ROOT / "eval" / "eval_set_v2.json"
EVAL_SET_V1_PATH = REPO_ROOT / "eval" / "eval_set.json"
SCRATCH_PATH = REPO_ROOT / "scratch" / "scratch_prompts.json"

STANDARD_HUMAN_STATEMENT = (
    "Every technology label names a real product that fits its component type."
)
SHINGLE_SIZE = 8


@pytest.fixture(scope="module")
def raw_bytes() -> bytes:
    return EVAL_SET_V2_PATH.read_bytes()


@pytest.fixture(scope="module")
def eval_set(raw_bytes: bytes) -> EvalSet:
    return EvalSet.model_validate(json.loads(raw_bytes.decode("utf-8")))


def _all_items(prompt: EvalPrompt):
    return [*prompt.must_include, *prompt.must_not_include]


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _shingles(text: str) -> set[tuple[str, ...]]:
    parts = _words(text)
    return {
        tuple(parts[index : index + SHINGLE_SIZE])
        for index in range(len(parts) - SHINGLE_SIZE + 1)
    }


def _forbidden_prompt_strings(prompt: EvalPrompt) -> set[str]:
    """Technology and component-type names used by this prompt's predicates."""

    forbidden: set[str] = set()
    for item in _all_items(prompt):
        if item.check != "deterministic":
            continue
        assert item.predicate is not None
        predicate = parse(item.predicate)
        for argument in predicate.arguments:
            if argument.name == "technology" and argument.operator == "~=":
                forbidden.add(argument.value)
            elif argument.name in {"from_type", "to_type", "member_type"}:
                forbidden.add(COMPONENT_TYPE_LABELS[argument.value])
            elif argument.name == "type" and predicate.function != "connection_exists":
                forbidden.add(COMPONENT_TYPE_LABELS[argument.value])
    return forbidden


# 1 ---------------------------------------------------------------------
def test_eval_set_loads_as_version_2(eval_set: EvalSet) -> None:
    assert eval_set.eval_set_version == "2.0"


# 2 ---------------------------------------------------------------------
def test_exactly_fifteen_sequential_unique_ids(eval_set: EvalSet) -> None:
    ids = [prompt.id for prompt in eval_set.prompts]

    assert len(ids) == 15
    assert ids == [f"ev2_{number:02d}" for number in range(1, 16)]
    assert len(set(ids)) == 15


# 3 ---------------------------------------------------------------------
def test_category_distribution(eval_set: EvalSet) -> None:
    counts = Counter(prompt.category for prompt in eval_set.prompts)

    assert counts == {"simple": 4, "medium": 4, "complex": 4, "adversarial": 3}


# 4 ---------------------------------------------------------------------
def test_adversarial_kinds_are_exactly_one_each(eval_set: EvalSet) -> None:
    adversarial = [p for p in eval_set.prompts if p.category == "adversarial"]

    assert Counter(p.adversarial_kind for p in adversarial) == {
        "contradiction": 1,
        "vague": 1,
        "impossible": 1,
    }
    assert all(
        prompt.adversarial_kind is None
        for prompt in eval_set.prompts
        if prompt.category != "adversarial"
    )


# 5 ---------------------------------------------------------------------
def test_rubric_minimums(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        assert len(prompt.must_include) >= 3, prompt.id
        assert len(prompt.must_not_include) >= 2, prompt.id


# 6 ---------------------------------------------------------------------
def test_predicates_parse_and_human_items_are_present(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        items = _all_items(prompt)
        for item in items:
            if item.check == "deterministic":
                assert item.predicate is not None, (prompt.id, item.id)
                parse(item.predicate)
            else:
                assert item.predicate is None, (prompt.id, item.id)

        humans = [item for item in items if item.check == "human"]
        assert humans, f"{prompt.id} has no human item"
        assert len(humans) <= 3, f"{prompt.id} has {len(humans)} human items"
        assert any(
            item.check == "human" and item.statement == STANDARD_HUMAN_STATEMENT
            for item in prompt.must_include
        ), f"{prompt.id} is missing the standard human item"


# 7 ---------------------------------------------------------------------
def test_blocking_flag_matrix(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        if prompt.category in {"simple", "medium", "complex"}:
            assert prompt.blocking_flag_expected == "forbidden", prompt.id
        elif prompt.adversarial_kind in {"contradiction", "impossible"}:
            assert prompt.blocking_flag_expected == "required", prompt.id
        else:
            assert prompt.blocking_flag_expected == "optional", prompt.id


# 8 ---------------------------------------------------------------------
def test_expected_assumptions_are_supplied(eval_set: EvalSet) -> None:
    vague = next(p for p in eval_set.prompts if p.adversarial_kind == "vague")

    assert len(vague.expected_assumptions) >= 2
    for prompt in eval_set.prompts:
        assert all(text.strip() for text in prompt.expected_assumptions), prompt.id
        if prompt.notes and "assumption" in prompt.notes.lower():
            assert prompt.expected_assumptions, prompt.id


# 9 ---------------------------------------------------------------------
def test_prompt_texts_are_unique_non_empty_and_short(eval_set: EvalSet) -> None:
    texts = [prompt.prompt for prompt in eval_set.prompts]

    assert len(set(texts)) == 15
    for prompt in eval_set.prompts:
        assert prompt.prompt.strip(), prompt.id
        assert len(prompt.prompt) <= 1200, prompt.id


# 10 --------------------------------------------------------------------
def test_prompt_text_does_not_leak_its_own_predicate_vocabulary(
    eval_set: EvalSet,
) -> None:
    for prompt in eval_set.prompts:
        for forbidden in _forbidden_prompt_strings(prompt):
            pattern = rf"\b{re.escape(forbidden)}\b"
            assert re.search(pattern, prompt.prompt, re.IGNORECASE) is None, (
                prompt.id,
                forbidden,
            )


# 11 --------------------------------------------------------------------
def test_no_eight_word_shingle_is_shared_with_v1_or_scratch(
    eval_set: EvalSet,
) -> None:
    v1 = json.loads(EVAL_SET_V1_PATH.read_text(encoding="utf-8"))
    scratch = json.loads(SCRATCH_PATH.read_text(encoding="utf-8"))
    other = [(entry["id"], entry["prompt"]) for entry in v1["prompts"]]
    other += [(entry["id"], entry["prompt"]) for entry in scratch]

    for prompt in eval_set.prompts:
        mine = _shingles(prompt.prompt)
        for other_id, other_text in other:
            assert not (mine & _shingles(other_text)), (prompt.id, other_id)


# 12 --------------------------------------------------------------------
def test_component_count_is_only_on_the_vague_prompt(eval_set: EvalSet) -> None:
    limited: list[str] = []
    for prompt in eval_set.prompts:
        for item in _all_items(prompt):
            if item.check == "deterministic" and item.predicate:
                if parse(item.predicate).function == "component_count":
                    limited.append(prompt.id)

    assert limited == ["ev2_14"]
    vague = next(p for p in eval_set.prompts if p.id == "ev2_14")
    assert vague.notes and "component_count(lte=7)" in vague.notes
    assert "prompt text alone" in vague.notes


# 13 --------------------------------------------------------------------
def test_eval_set_is_byte_stable(eval_set: EvalSet, raw_bytes: bytes) -> None:
    redumped = json.dumps(
        eval_set.model_dump(mode="json"), indent=2, ensure_ascii=False
    ) + "\n"

    assert redumped.encode("utf-8") == raw_bytes
    assert hashlib.sha256(raw_bytes).hexdigest().upper() == (
        "BD713F574A3C1EDFD6E450B38EF055B0AEEB18350CA62B1DB77DCC87F1E2770E"
    )


# 14 --------------------------------------------------------------------
def test_ids_and_version_cannot_be_mixed() -> None:
    payload = json.loads(EVAL_SET_V2_PATH.read_text(encoding="utf-8"))

    payload["eval_set_version"] = "1.0"
    with pytest.raises(ValueError, match="does not match eval set version"):
        EvalSet.model_validate(payload)


# 15 ---------------------------------------------------------------------
def test_polarity_layout_is_explicit(eval_set: EvalSet) -> None:
    for prompt in eval_set.prompts:
        all_items = _all_items(prompt)
        assert all(
            item.predicate is None
            or parse(item.predicate).function != "no_flag"
            for item in all_items
        ), prompt.id
        assert all(
            item.predicate is None
            or parse(item.predicate).function != "no_component"
            for item in all_items
        ), prompt.id

        include_functions = {
            parse(item.predicate).function
            for item in prompt.must_include
            if item.check == "deterministic" and item.predicate
        }
        assert "no_reference_issues" in include_functions, prompt.id
        assert "no_connection" in include_functions, prompt.id

        for item in prompt.must_not_include:
            if item.check == "deterministic":
                assert item.predicate is not None, (prompt.id, item.id)
                assert parse(item.predicate).function == "component_exists", (
                    prompt.id,
                    item.id,
                )


# 16 ---------------------------------------------------------------------
def test_ev2_13_reviewer_prompt_and_blocking_rule(eval_set: EvalSet) -> None:
    prompt = next(p for p in eval_set.prompts if p.id == "ev2_13")
    assert prompt.prompt == (
        "Design a meeting-room booking system for a company with offices in "
        "three countries. Every office must always see exactly the same, latest "
        "bookings. Every office must also keep accepting new bookings while its "
        "link to the other offices is down. Deliver a design."
    )
    assert prompt.title == "Global meeting-room booking with partition tolerance"
    assert prompt.blocking_flag_expected == "required"
    assert any(
        item.check == "deterministic"
        and item.predicate
        and parse(item.predicate).function == "flag_present"
        for item in prompt.must_include
    )


# 17 ---------------------------------------------------------------------
AFFECTED_HUMAN_ITEMS: dict[str, dict[str, list[tuple[str, str]]]] = {
    "ev2_09": {
        "must_include": [
            ("r04", STANDARD_HUMAN_STATEMENT),
            ("r05", "The expiry path reaches durable seat state."),
        ],
        "must_not_include": [("x01", "A seat is never sold twice.")],
    },
    "ev2_10": {
        "must_include": [
            ("r04", STANDARD_HUMAN_STATEMENT),
            ("r05", "Authorisation is represented as an explicit boundary."),
        ],
        "must_not_include": [
            ("x03", "Audit entries cannot be edited or deleted by officials.")
        ],
    },
    "ev2_11": {
        "must_include": [("r04", STANDARD_HUMAN_STATEMENT)],
        "must_not_include": [
            ("x02", "Regulatory checks are not bypassed before funds move.")
        ],
    },
    "ev2_12": {
        "must_include": [
            ("r04", STANDARD_HUMAN_STATEMENT),
            (
                "r05",
                "Feed events reach durable storage from the external feed boundary.",
            ),
        ],
        "must_not_include": [
            ("x02", "Replay uses recorded historical state, not current state.")
        ],
    },
    "ev2_14": {
        "must_include": [("r04", STANDARD_HUMAN_STATEMENT)],
        "must_not_include": [
            ("x02", "Invented product benefits are not presented as facts.")
        ],
    },
}


@pytest.mark.parametrize("prompt_id", sorted(AFFECTED_HUMAN_ITEMS))
def test_revised_human_items_are_exact(eval_set: EvalSet, prompt_id: str) -> None:
    prompt = next(p for p in eval_set.prompts if p.id == prompt_id)
    expected = AFFECTED_HUMAN_ITEMS[prompt_id]

    for field_name, wanted in expected.items():
        actual = [
            (item.id, item.statement)
            for item in getattr(prompt, field_name)
            if item.check == "human"
        ]
        assert actual == wanted, (prompt_id, field_name)

    for item in _all_items(prompt):
        if item.check != "human":
            continue
        lowered = item.statement.lower()
        assert "assumption" not in lowered, (prompt_id, item.id)
        assert "payment" not in lowered, (prompt_id, item.id)
        assert "counterparty" not in lowered, (prompt_id, item.id)


@pytest.mark.parametrize(
    ("prompt_id", "component_type"),
    [
        ("ev2_09", "cdn"),
        ("ev2_14", "cdn"),
        ("ev2_12", "object_storage"),
    ],
)
def test_removed_exclusion_is_absent(
    eval_set: EvalSet, prompt_id: str, component_type: str
) -> None:
    prompt = next(p for p in eval_set.prompts if p.id == prompt_id)
    removed = f"component_exists(type={component_type})"

    assert all(
        item.predicate != removed
        for item in _all_items(prompt)
        if item.check == "deterministic"
    ), prompt_id

"""The predicate grammar accepts exactly the forms in the step 2 prompt."""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from app.eval.predicates import Argument, Predicate, PredicateError, parse


@pytest.mark.parametrize(
    ("text", "function", "arguments"),
    [
        (
            "component_exists(type=service)",
            "component_exists",
            (Argument("type", "=", "service"),),
        ),
        (
            'component_exists(type=cache, technology~="redis")',
            "component_exists",
            (
                Argument("type", "=", "cache"),
                Argument("technology", "~=", "redis"),
            ),
        ),
        (
            "connection_exists(from_type=service, to_type=message_queue, type=async)",
            "connection_exists",
            (
                Argument("from_type", "=", "service"),
                Argument("to_type", "=", "message_queue"),
                Argument("type", "=", "async"),
            ),
        ),
        (
            'connection_exists(from_type=service, to_type=message_queue, label~="publishes")',
            "connection_exists",
            (
                Argument("from_type", "=", "service"),
                Argument("to_type", "=", "message_queue"),
                Argument("label", "~=", "publishes"),
            ),
        ),
        (
            "path_exists(from_type=client, to_type=service)",
            "path_exists",
            (
                Argument("from_type", "=", "client"),
                Argument("to_type", "=", "service"),
            ),
        ),
        (
            "no_connection(from_type=client, to_type=database)",
            "no_connection",
            (
                Argument("from_type", "=", "client"),
                Argument("to_type", "=", "database"),
            ),
        ),
        (
            "no_component(type=cdn)",
            "no_component",
            (Argument("type", "=", "cdn"),),
        ),
        (
            "group_exists(member_type=worker)",
            "group_exists",
            (Argument("member_type", "=", "worker"),),
        ),
        ("no_reference_issues()", "no_reference_issues", ()),
        (
            "flag_present(kind=contradiction, severity=blocking)",
            "flag_present",
            (
                Argument("kind", "=", "contradiction"),
                Argument("severity", "=", "blocking"),
            ),
        ),
        (
            "no_flag(severity=warning)",
            "no_flag",
            (Argument("severity", "=", "warning"),),
        ),
        (
            'assumption_present(text~="single region")',
            "assumption_present",
            (Argument("text", "~=", "single region"),),
        ),
        (
            "component_count(lte=12)",
            "component_count",
            (Argument("lte", "=", "12"),),
        ),
    ],
)
def test_every_grammar_form_parses(
    text: str, function: str, arguments: tuple[Argument, ...]
) -> None:
    predicate = parse(text)

    assert isinstance(predicate, Predicate)
    assert predicate.function == function
    assert predicate.arguments == arguments


def test_unknown_function_is_rejected() -> None:
    with pytest.raises(PredicateError, match="unknown function"):
        parse("component_present(type=service)")


@pytest.mark.parametrize(
    "text",
    [
        "component_exists(type=queue)",
        "no_component(type=queues)",
        "group_exists(member_type=queues)",
        "connection_exists(from_type=service, to_type=nope, type=sync)",
        "connection_exists(from_type=service, to_type=service, type=synchronous)",
        "path_exists(from_type=queue, to_type=service)",
        "path_exists(from_type=client, to_type=services)",
        "flag_present(kind=problem, severity=blocking)",
        "flag_present(kind=contradiction, severity=fatal)",
        "no_flag(severity=error)",
    ],
)
def test_unknown_enum_value_is_rejected(text: str) -> None:
    with pytest.raises(PredicateError, match="not a valid"):
        parse(text)


@pytest.mark.parametrize(
    "text",
    [
        "component_exists(type=service, colour=blue)",
        "component_exists(type=service, type=cache)",
        "no_flag(kind=contradiction)",
        "flag_present(kind=contradiction)",
        "flag_present(severity=blocking)",
        "connection_exists(from_type=service)",
        "connection_exists(from_type=service, to_type=message_queue)",
        "path_exists(from_type=client)",
        "path_exists()",
        "path_exists(from_type=client, to_type=service, type=sync)",
        "path_exists(from_type=client, from_type=service, to_type=service)",
        "no_connection(from_type=client)",
        "group_exists()",
        "component_count()",
        "assumption_present()",
    ],
)
def test_unknown_duplicate_or_missing_arguments_are_rejected(text: str) -> None:
    with pytest.raises(PredicateError):
        parse(text)


@pytest.mark.parametrize(
    "text",
    [
        "component_exists(type=service, technology=redis)",
        "component_exists(type=service, technology~=redis)",
        "component_exists(type=service, technology~=\"\")",
        "component_exists(type=service, technology~=\"" + "x" * 81 + "\")",
        "component_exists(type=\"service\")",
        "component_count(lte=-1)",
        "component_count(lte=1.5)",
        "component_count(lte=one)",
        "flag_present(kind=contradiction, severity=\"blocking\")",
    ],
)
def test_operator_and_value_forms_are_enforced(text: str) -> None:
    with pytest.raises(PredicateError):
        parse(text)


@pytest.mark.parametrize(
    "text",
    [
        "component_exists",
        "component_exists(type=service) trailing",
        "component_exists(type=service",
        "component_exists(type=service))",
        "component_exists(type=service, )",
        "component_exists(type=service, technology~=\"unbalanced)",
        "group_exists(member_type=Service)",
        " component_exists(type=service)",
        "component_exists(type=service) ",
    ],
)
def test_malformed_input_is_rejected(text: str) -> None:
    with pytest.raises(PredicateError):
        parse(text)


def test_string_argument_of_exactly_eighty_characters_is_accepted() -> None:
    predicate = parse('component_exists(type=service, technology~="' + "x" * 80 + '")')

    assert predicate.get("technology") == "x" * 80


def test_commas_inside_a_quoted_string_do_not_split_arguments() -> None:
    predicate = parse('connection_exists(from_type=service, to_type=cache, label~="read, then write")')

    assert predicate.get("label") == "read, then write"


def test_parser_is_side_effect_free_and_returns_frozen_data() -> None:
    first = parse("component_exists(type=service)")
    second = parse("component_exists(type=service)")

    assert first == second
    assert hash(first) == hash(second)
    with pytest.raises(FrozenInstanceError):
        first.function = "no_component"  # type: ignore[misc]

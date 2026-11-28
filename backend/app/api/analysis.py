"""Deterministic capacity, cost and security analysis of architecture drafts.

All attribute values live in ``component.attributes`` as strings: the graph
schema is hash-pinned and must not gain first-class simulation fields. These
functions never mutate the supplied draft.
"""

from __future__ import annotations

import math
import re
from collections import deque
from typing import Any

from app.api.models import (
    Bottleneck,
    CostItem,
    CostRequest,
    CostResult,
    NodeLoad,
    SecurityFinding,
    SecurityRequest,
    SecurityResult,
    SimulationEvent,
    SimulationRequest,
    SimulationResult,
)
from app.model.component import Component

MONTHLY_HOURS = 730

# capacity_rps, hourly_cost_usd, latency_ms, replicas -- mirrored from the UI.
DEFAULT_ATTRIBUTES: dict[str, dict[str, str]] = {
    "client": {"capacity_rps": "5000", "hourly_cost_usd": "0.00", "latency_ms": "5", "replicas": "1"},
    "api_gateway": {"capacity_rps": "3000", "hourly_cost_usd": "0.08", "latency_ms": "10", "replicas": "1"},
    "load_balancer": {"capacity_rps": "8000", "hourly_cost_usd": "0.12", "latency_ms": "5", "replicas": "1"},
    "service": {"capacity_rps": "1000", "hourly_cost_usd": "0.10", "latency_ms": "25", "replicas": "1"},
    "worker": {"capacity_rps": "500", "hourly_cost_usd": "0.06", "latency_ms": "40", "replicas": "1"},
    "database": {"capacity_rps": "800", "hourly_cost_usd": "0.25", "latency_ms": "15", "replicas": "1"},
    "cache": {"capacity_rps": "5000", "hourly_cost_usd": "0.12", "latency_ms": "2", "replicas": "1"},
    "message_queue": {"capacity_rps": "4000", "hourly_cost_usd": "0.09", "latency_ms": "8", "replicas": "1"},
    "object_storage": {"capacity_rps": "2000", "hourly_cost_usd": "0.05", "latency_ms": "30", "replicas": "1"},
    "cdn": {"capacity_rps": "10000", "hourly_cost_usd": "0.15", "latency_ms": "3", "replicas": "1"},
    "auth_provider": {"capacity_rps": "1500", "hourly_cost_usd": "0.07", "latency_ms": "20", "replicas": "1"},
    "search_index": {"capacity_rps": "1200", "hourly_cost_usd": "0.18", "latency_ms": "35", "replicas": "1"},
    "scheduler": {"capacity_rps": "300", "hourly_cost_usd": "0.04", "latency_ms": "50", "replicas": "1"},
    "external_service": {"capacity_rps": "1000", "hourly_cost_usd": "0.02", "latency_ms": "80", "replicas": "1"},
}

DATA_STORE_TYPES = frozenset({"database", "cache", "object_storage"})
INSECURE_PROTOCOLS = frozenset({"http", "tcp", "sql"})
_REPLICAS_PATTERN = re.compile(r"^[0-9]+$")


def _type_name(component: Component) -> str:
    value: Any = getattr(component, "type", "service")
    return str(getattr(value, "value", value))


def _parse_number(
    raw: Any, *, integer: bool = False, minimum: float = 0.0
) -> float | None:
    """Parse a stored attribute string, or None when it is unusable."""

    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    if integer and not _REPLICAS_PATTERN.fullmatch(text):
        return None
    try:
        value: float | int = int(text) if integer else float(text)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(float(value)) or value < minimum:
        return None
    return float(value)


def effective_attributes(component: Component) -> dict[str, str]:
    """Return the four simulation attributes, preserving valid stored values.

    Invalid numeric strings are replaced by the per-type default. Unrelated
    attributes are carried through unchanged. The component is not modified.
    """

    defaults = DEFAULT_ATTRIBUTES.get(_type_name(component), DEFAULT_ATTRIBUTES["service"])
    existing = component.attributes or {}
    result: dict[str, str] = {}
    for key, default in defaults.items():
        integer = key in {"replicas", "latency_ms"}
        minimum = 1 if key == "replicas" else 0
        value = _parse_number(existing.get(key), integer=integer, minimum=minimum)
        if value is None:
            result[key] = default
        elif key == "hourly_cost_usd":
            result[key] = f"{value:.2f}"
        elif integer:
            result[key] = str(int(value))
        elif value.is_integer():
            result[key] = str(int(value))
        else:
            result[key] = str(value)
    for key, value in existing.items():
        if key not in result:
            result[key] = value
    return result


def _replicas(attributes: dict[str, str]) -> int:
    value = _parse_number(attributes.get("replicas"), integer=True, minimum=1)
    return max(1, int(value or 1))


def _unit_cost(attributes: dict[str, str]) -> float:
    return _parse_number(attributes.get("hourly_cost_usd"), minimum=0) or 0.0


def _latency(attributes: dict[str, str]) -> float:
    return _parse_number(attributes.get("latency_ms"), minimum=0) or 0.0


def _capacity(attributes: dict[str, str]) -> float:
    raw = _parse_number(attributes.get("capacity_rps"), minimum=0) or 0.0
    return max(1.0, raw * _replicas(attributes))


def _round2(value: float) -> float:
    return round(float(value), 2)


def _topological_order(
    component_ids: list[str], outgoing: dict[str, list[str]], incoming: dict[str, list[str]]
) -> list[str]:
    indegree = {component_id: len(incoming[component_id]) for component_id in component_ids}
    ready = deque(component_id for component_id in component_ids if indegree[component_id] == 0)
    ordered: list[str] = []
    while ready:
        component_id = ready.popleft()
        ordered.append(component_id)
        for target in outgoing[component_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
    if len(ordered) < len(component_ids):
        seen = set(ordered)
        ordered.extend(component_id for component_id in component_ids if component_id not in seen)
    return ordered


def simulate(request: SimulationRequest) -> SimulationResult:
    """Run one deterministic traffic pass over the draft."""

    draft = request.current_architecture
    components = list(draft.components)
    component_ids = [component.id for component in components]
    by_id = {component.id: component for component in components}
    known = set(component_ids)
    outgoing: dict[str, list[str]] = {component_id: [] for component_id in component_ids}
    incoming: dict[str, list[str]] = {component_id: [] for component_id in component_ids}
    for connection in draft.connections:
        source, target = connection.from_, connection.to
        if source in known and target in known:
            outgoing[source].append(target)
            incoming[target].append(source)

    ingress = [component_id for component_id in component_ids if not incoming[component_id]]
    if not ingress:
        ingress = list(component_ids)
    share = request.peak_rps / len(ingress)
    loads = {component_id: 0.0 for component_id in component_ids}
    for component_id in ingress:
        loads[component_id] += share

    node_loads: list[NodeLoad] = []
    bottlenecks: list[Bottleneck] = []
    events: list[SimulationEvent] = [
        SimulationEvent(
            t_s=0.0,
            severity="info",
            message=(
                f"Simulation started at {request.peak_rps:.2f} RPS for {request.duration_s}s "
                f"across {len(ingress)} ingress component(s)."
            ),
        )
    ]
    total_dropped = 0.0
    total_hourly_cost = 0.0

    for component_id in _topological_order(component_ids, outgoing, incoming):
        component = by_id[component_id]
        attributes = effective_attributes(component)
        capacity = _capacity(attributes)
        replicas = _replicas(attributes)
        unit_cost = _unit_cost(attributes)
        hourly_cost = unit_cost * replicas
        total_hourly_cost += hourly_cost
        load = loads[component_id]
        utilization = load / capacity
        bottleneck = utilization > 1
        dropped = load - capacity if bottleneck else 0.0
        forwarded = capacity if bottleneck else load
        total_dropped += dropped
        node_loads.append(
            NodeLoad(
                component_id=component_id,
                name=component.name,
                type=_type_name(component),
                load_rps=_round2(load),
                capacity_rps=_round2(capacity),
                utilization=_round2(utilization),
                bottleneck=bottleneck,
                replicas=replicas,
                latency_ms=_round2(_latency(attributes)),
                hourly_cost_usd=_round2(hourly_cost),
            )
        )
        if bottleneck:
            name = component.name
            events.append(
                SimulationEvent(
                    t_s=0.0,
                    severity="error",
                    component_id=component_id,
                    message=(
                        f"{name} received {load:.2f} RPS but its capacity is {capacity:.2f} RPS "
                        f"({utilization * 100:.0f}% utilization); dropped {dropped:.2f} RPS."
                    ),
                )
            )
            kind = _type_name(component)
            if kind == "database":
                recommendation = (
                    f"Scale {name} (add read replicas or a cache in front of it) and raise "
                    "capacity_rps before accepting this traffic."
                )
            else:
                recommendation = (
                    f"Add replicas or raise capacity_rps on {name}: {replicas} replica(s) "
                    f"currently provide {capacity:.2f} RPS of effective capacity."
                )
            bottlenecks.append(
                Bottleneck(
                    component_id=component_id,
                    component_name=name,
                    utilization=_round2(utilization),
                    dropped_rps=_round2(dropped),
                    recommendation=recommendation,
                )
            )
        targets = outgoing[component_id]
        if targets and forwarded:
            per_target = forwarded / len(targets)
            for target in targets:
                loads[target] += per_target

    ok = not bottlenecks
    events.append(
        SimulationEvent(
            t_s=float(request.duration_s),
            severity="info",
            message=(
                f"Simulation finished: {len(bottlenecks)} bottleneck(s), "
                f"{total_dropped:.2f} RPS dropped."
            ),
        )
    )
    return SimulationResult(
        ok=ok,
        peak_rps=request.peak_rps,
        duration_s=request.duration_s,
        total_dropped_rps=_round2(total_dropped),
        estimated_cost_usd=_round2(total_hourly_cost * request.duration_s / 3600),
        node_loads=node_loads,
        events=events,
        bottlenecks=bottlenecks,
    )


def analyze_cost(request: CostRequest) -> CostResult:
    """Estimate hourly and monthly run cost from replica-adjusted attributes."""

    items: list[CostItem] = []
    hourly_total = 0.0
    monthly_total = 0.0
    for component in request.current_architecture.components:
        attributes = effective_attributes(component)
        replicas = _replicas(attributes)
        unit_cost = _unit_cost(attributes)
        hourly = _round2(unit_cost * replicas)
        monthly = _round2(unit_cost * replicas * MONTHLY_HOURS)
        hourly_total += hourly
        monthly_total += monthly
        items.append(
            CostItem(
                component_id=component.id,
                name=component.name,
                type=_type_name(component),
                replicas=replicas,
                unit_cost_usd=_round2(unit_cost),
                hourly_cost_usd=hourly,
                monthly_cost_usd=monthly,
                basis="component.attributes.hourly_cost_usd x replicas",
            )
        )
    return CostResult(
        hourly_total_usd=_round2(hourly_total),
        monthly_total_usd=_round2(monthly_total),
        items=items,
    )


def _connection_protocol(connection: Any) -> str | None:
    """Prefer an explicit protocol, then fall back to the technology label."""

    value = getattr(connection, "protocol", None)
    if not value:
        attributes = getattr(connection, "attributes", None)
        if isinstance(attributes, dict):
            value = attributes.get("protocol")
    if not value:
        value = getattr(connection, "technology", None)
    if not value:
        return None
    return str(value).strip().lower()


def analyze_security(request: SecurityRequest) -> SecurityResult:
    """Apply the fixed, explainable security rules to a draft."""

    draft = request.current_architecture
    components = list(draft.components)
    by_id = {component.id: component for component in components}
    types = {component.id: _type_name(component) for component in components}
    connections = list(draft.connections)
    findings: list[SecurityFinding] = []
    critical_connections: set[str] = set()

    for connection in connections:
        target = connection.to
        if types.get(target) not in DATA_STORE_TYPES:
            continue
        protocol = _connection_protocol(connection)
        if protocol is None or protocol in INSECURE_PROTOCOLS:
            critical_connections.add(connection.id)
            findings.append(
                SecurityFinding(
                    rule="unencrypted_data_store",
                    severity="critical",
                    title="Unencrypted data-store connection",
                    message=(
                        f"Connection {connection.id!r} reaches {target!r} over "
                        f"{protocol or 'an unspecified protocol'}."
                    ),
                    recommendation=(
                        "Use an encrypted transport (TLS/HTTPS) or a dedicated secured "
                        "driver for this data-store connection."
                    ),
                    component_id=target,
                    connection_id=connection.id,
                )
            )

    for connection in connections:
        source, target = connection.from_, connection.to
        if types.get(source) == "client" and types.get(target) in DATA_STORE_TYPES:
            critical_connections.add(connection.id)
            findings.append(
                SecurityFinding(
                    rule="client_direct_data_store",
                    severity="critical",
                    title="Client can reach data store directly",
                    message=(
                        f"Client {source!r} connects straight to data store {target!r} "
                        f"via {connection.id!r}."
                    ),
                    recommendation=(
                        "Route client traffic through an API gateway and service layer "
                        "instead of exposing the data store."
                    ),
                    component_id=target,
                    connection_id=connection.id,
                )
            )

    clients = [component.id for component in components if types[component.id] == "client"]
    gateways = [component.id for component in components if types[component.id] == "api_gateway"]
    if clients and not gateways:
        findings.append(
            SecurityFinding(
                rule="missing_api_gateway",
                severity="warning",
                title="Missing API gateway",
                message=f"Client {clients[0]!r} has no API gateway in front of the system.",
                recommendation="Add an API gateway to centralize auth, rate limiting and TLS termination.",
                component_id=clients[0],
            )
        )

    for connection in connections:
        if types.get(connection.to) != "external_service":
            continue
        protocol = _connection_protocol(connection)
        if protocol is None or protocol == "http":
            critical_connections.add(connection.id)
            findings.append(
                SecurityFinding(
                    rule="plaintext_external_traffic",
                    severity="critical",
                    title="Plaintext external traffic",
                    message=(
                        f"Connection {connection.id!r} calls an external service over "
                        f"{protocol or 'an unspecified protocol'}."
                    ),
                    recommendation="Switch the integration to HTTPS with certificate verification enabled.",
                    component_id=connection.to,
                    connection_id=connection.id,
                )
            )

    for connection in connections:
        protocol = _connection_protocol(connection)
        if protocol in INSECURE_PROTOCOLS and connection.id not in critical_connections:
            findings.append(
                SecurityFinding(
                    rule="unencrypted_service_traffic",
                    severity="warning",
                    title="Unencrypted service traffic",
                    message=(
                        f"Connection {connection.id!r} uses {protocol!r} between "
                        f"{connection.from_!r} and {connection.to!r}."
                    ),
                    recommendation="Use HTTPS, gRPC over TLS or another encrypted transport.",
                    component_id=connection.to if connection.to in by_id else None,
                    connection_id=connection.id,
                )
            )

    auth_providers = [
        component.id for component in components if types[component.id] == "auth_provider"
    ]
    protected = [
        component.id
        for component in components
        if types[component.id] in {"api_gateway", "service"}
    ]
    if protected and not auth_providers:
        findings.append(
            SecurityFinding(
                rule="missing_auth_provider",
                severity="warning",
                title="No explicit auth provider",
                message=f"No auth_provider is present for {protected[0]!r}.",
                recommendation="Add an auth_provider and make the gateway/service verify its tokens.",
                component_id=protected[0],
            )
        )

    return SecurityResult(
        passed=not any(finding.severity == "critical" for finding in findings),
        findings=findings,
    )

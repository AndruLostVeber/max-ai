from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.research.contracts import (
    ResearchCoverage,
    ResearchDeliverable,
    ResearchEvidence,
    ResearchIntent,
    ResearchMetric,
    ResearchSource,
    ResearchTable,
)
from app.services.research.market_data import MarketDataService

_PERCENT_RE = re.compile(r"(?<!\w)([+-]?\d+(?:[.,]\d+)?)\s*%")
_NUMBER_RE = re.compile(r"(?<!\w)(?:\$|USD|USDT|₽|€)?\s*([+-]?\d[\d\s]*(?:[.,]\d+)?)")


@dataclass(slots=True)
class AnalysisBundle:
    findings: list[str] = field(default_factory=list)
    uncertainties: list[str] = field(default_factory=list)
    deliverables: list[ResearchDeliverable] = field(default_factory=list)
    tables: list[ResearchTable] = field(default_factory=list)
    metrics: list[ResearchMetric] = field(default_factory=list)


async def analyze_research(
    *,
    query: str,
    intent: ResearchIntent,
    sources: list[ResearchSource],
    evidences: list[ResearchEvidence],
    deliverables: list[ResearchDeliverable],
    market_data_svc: MarketDataService | None = None,
) -> AnalysisBundle:
    bundle = AnalysisBundle(deliverables=[item.model_copy(deep=True) for item in deliverables])
    if intent.kind == "time_series":
        await _analyze_time_series(
            bundle,
            query=query,
            intent=intent,
            sources=sources,
            evidences=evidences,
            market_data_svc=market_data_svc,
        )
    elif intent.kind == "comparison":
        _analyze_comparison(bundle, intent=intent, sources=sources, evidences=evidences)
    elif intent.kind == "fact_check":
        _analyze_fact_check(bundle, query=query, evidences=evidences)
    else:
        _analyze_general(bundle, sources=sources, evidences=evidences)

    _mark_deliverables(bundle, intent=intent)
    return bundle


def render_analysis_markdown(
    *,
    query: str,
    intent: ResearchIntent,
    findings: list[str],
    uncertainties: list[str],
    sources: list[ResearchSource],
    coverage: list[ResearchCoverage],
    deliverables: list[ResearchDeliverable],
    tables: list[ResearchTable],
    metrics: list[ResearchMetric],
) -> str:
    lines = ["# Research Brief"]

    scope_bits: list[str] = []
    if intent.entities:
        scope_bits.append(", ".join(intent.entities))
    if intent.time_range and intent.time_range.label:
        scope_bits.append(intent.time_range.label)
    if scope_bits:
        lines.extend(["", f"Scope: {' | '.join(scope_bits)}"])

    if findings:
        lines.extend(["", "## Key Findings"])
        for finding in findings[:5]:
            lines.append(f"- {finding}")

    visible_tables = [table for table in tables if table.rows][:2]
    if visible_tables:
        lines.extend(["", "## Table"])
        for table in visible_tables:
            lines.append(f"### {table.title}")
            lines.append("```text")
            lines.append(_render_plain_table(table.columns, table.rows))
            lines.append("```")
            for note in table.notes[:2]:
                lines.append(f"- {note}")

    elif metrics:
        lines.extend(["", "## Key Numbers"])
        for metric in metrics[:8]:
            unit_suffix = f" {metric.unit}" if metric.unit else ""
            lines.append(f"- {metric.entity}: {metric.name} = {metric.value}{unit_suffix}")

    missing_required = [item for item in deliverables if item.required and not item.satisfied]
    compact_uncertainties = list(dict.fromkeys(uncertainties))
    if missing_required:
        lines.extend(["", "## What Is Missing"])
        for item in missing_required[:4]:
            suffix = f" {item.details}" if item.details else ""
            lines.append(f"- {item.title}.{suffix}".strip())
    elif compact_uncertainties:
        lines.extend(["", "## Limitations"])
        for note in compact_uncertainties[:3]:
            lines.append(f"- {note}")

    if sources:
        lines.extend(["", "## Sources"])
        for source in sources[:4]:
            lines.append(f"- {source.title}: {source.url}")

    return "\n".join(lines)


async def _analyze_time_series(
    bundle: AnalysisBundle,
    *,
    query: str,
    intent: ResearchIntent,
    sources: list[ResearchSource],
    evidences: list[ResearchEvidence],
    market_data_svc: MarketDataService | None,
) -> None:
    if (
        market_data_svc
        and intent.time_range
        and intent.time_range.start_date
        and intent.time_range.end_date
        and intent.entities
    ):
        rows: list[list[str]] = []
        pct_changes: list[tuple[str, float]] = []
        for entity in intent.entities:
            try:
                history = await market_data_svc.get_history(
                    entity,
                    start_date=intent.time_range.start_date,
                    end_date=intent.time_range.end_date,
                )
            except Exception as exc:
                bundle.uncertainties.append(f"Could not fetch structured market data for {entity}: {exc}")
                continue

            if len(history) < 2:
                bundle.uncertainties.append(f"Structured market data for {entity} was insufficient for the requested period.")
                continue

            start_price = history[0].price
            end_price = history[-1].price
            high = max(point.price for point in history)
            low = min(point.price for point in history)
            abs_change = end_price - start_price
            pct_change = (abs_change / start_price * 100.0) if start_price else 0.0
            pct_changes.append((entity, pct_change))

            metric_source_ids = [source.source_id for source in _entity_sources(entity, intent, sources)[:2]]
            bundle.metrics.extend(
                [
                    ResearchMetric(metric_id=f"{entity}-start", entity=entity, name="start_price", value=f"{start_price:.2f}", unit="USD", source_ids=metric_source_ids, confidence=0.95),
                    ResearchMetric(metric_id=f"{entity}-end", entity=entity, name="end_price", value=f"{end_price:.2f}", unit="USD", source_ids=metric_source_ids, confidence=0.95),
                    ResearchMetric(metric_id=f"{entity}-change", entity=entity, name="absolute_change", value=f"{abs_change:.2f}", unit="USD", source_ids=metric_source_ids, confidence=0.95),
                    ResearchMetric(metric_id=f"{entity}-pct", entity=entity, name="percent_change", value=f"{pct_change:.2f}", unit="%", source_ids=metric_source_ids, confidence=0.95),
                    ResearchMetric(metric_id=f"{entity}-high", entity=entity, name="high", value=f"{high:.2f}", unit="USD", source_ids=metric_source_ids, confidence=0.95),
                    ResearchMetric(metric_id=f"{entity}-low", entity=entity, name="low", value=f"{low:.2f}", unit="USD", source_ids=metric_source_ids, confidence=0.95),
                ]
            )
            rows.append(
                [
                    entity,
                    intent.time_range.label or "requested period",
                    f"{start_price:.2f}",
                    f"{end_price:.2f}",
                    f"{abs_change:.2f}",
                    f"{pct_change:.2f}%",
                    f"{high:.2f}",
                    f"{low:.2f}",
                ]
            )

        if rows:
            bundle.tables.append(
                ResearchTable(
                    table_id="time-series-summary",
                    title="Performance summary",
                    columns=["Entity", "Period", "Start", "End", "Change", "% Change", "High", "Low"],
                    rows=rows,
                    notes=["Structured market data was used for numeric calculations."],
                )
            )
            bundle.tables.append(
                ResearchTable(
                    table_id="time-series-deliverables",
                    title="Time-series coverage",
                    columns=["Entity", "Structured data", "Metrics", "Source matches"],
                    rows=[
                        [
                            entity,
                            "yes",
                            str(len([metric for metric in bundle.metrics if metric.entity == entity])),
                            str(len(_entity_sources(entity, intent, sources))),
                        ]
                        for entity in intent.entities
                    ],
                    notes=[],
                )
            )
            for entity, pct_change in sorted(pct_changes, key=lambda item: item[1], reverse=True):
                bundle.findings.append(f"{entity} changed by {pct_change:.2f}% over {intent.time_range.label}.")
            if len(pct_changes) >= 2:
                leader, leader_change = max(pct_changes, key=lambda item: item[1])
                lagger, lagger_change = min(pct_changes, key=lambda item: item[1])
                bundle.findings.append(
                    f"{leader} outperformed {lagger} by {(leader_change - lagger_change):.2f} percentage points in {intent.time_range.label}."
                )

    if not bundle.tables:
        _analyze_comparison(bundle, intent=intent, sources=sources, evidences=evidences)
        if intent.requires_quantitative_analysis:
            bundle.uncertainties.append(
                "Structured time-series data was not available, so the response falls back to source-based comparison instead of full quantitative analysis."
            )


def _analyze_comparison(
    bundle: AnalysisBundle,
    *,
    intent: ResearchIntent,
    sources: list[ResearchSource],
    evidences: list[ResearchEvidence],
) -> None:
    entities = intent.entities or _derive_entities_from_sources(sources)
    rows: list[list[str]] = []
    for entity in entities:
        entity_sources = _entity_sources(entity, intent, sources)
        entity_evidences = _entity_evidences(entity, intent, evidences, sources)
        numeric_signals = _numeric_signals_from_texts(
            [item.claim for item in entity_evidences] + [item.excerpt for item in entity_evidences]
        )
        representative = entity_evidences[0].claim if entity_evidences else (entity_sources[0].title if entity_sources else "No direct finding")
        rows.append(
            [
                entity,
                str(len(entity_evidences)),
                str(len({source.domain for source in entity_sources})),
                str(len(numeric_signals)),
                representative[:80],
            ]
        )
        if entity_evidences:
            bundle.findings.append(f"{entity}: {entity_evidences[0].claim}")
        elif entity_sources:
            bundle.findings.append(f"{entity}: coverage exists at the source level but extracted evidence is still weak.")
        else:
            bundle.uncertainties.append(f"No dedicated coverage was collected for {entity}.")

    if rows:
        bundle.tables.append(
            ResearchTable(
                table_id="comparison-summary",
                title="Comparison summary",
                columns=["Entity", "Evidence", "Domains", "Numeric signals", "Representative finding"],
                rows=rows,
                notes=["Numeric signals count reflects numbers and percentages found in extracted evidence."],
            )
        )
    if evidences:
        bundle.tables.append(
            ResearchTable(
                table_id="comparison-evidence-map",
                title="Evidence map",
                columns=["Evidence", "Facet", "Source"],
                rows=[
                    [
                        f"{evidence.evidence_id}: {evidence.claim[:72]}",
                        evidence.facet_id,
                        _source_label(evidence.source_id, sources),
                    ]
                    for evidence in evidences[:8]
                ],
                notes=[],
            )
        )


def _analyze_fact_check(
    bundle: AnalysisBundle,
    *,
    query: str,
    evidences: list[ResearchEvidence],
) -> None:
    supports = sum(1 for evidence in evidences if evidence.stance == "supports")
    contradicts = sum(1 for evidence in evidences if evidence.stance == "contradicts")
    if not evidences:
        bundle.findings.append(f"Verdict: insufficient evidence for `{query}`.")
        bundle.uncertainties.append("No evidence was collected to verify the claim.")
        return

    if supports > contradicts:
        verdict = "supported"
    elif contradicts > supports:
        verdict = "contradicted"
    else:
        verdict = "mixed / insufficient"

    bundle.findings.append(f"Verdict: {verdict}.")
    bundle.findings.append(f"Evidence was collected for the claim: {query}")
    bundle.findings.append(f"Top evidence: {evidences[0].claim}")


def _analyze_general(
    bundle: AnalysisBundle,
    *,
    sources: list[ResearchSource],
    evidences: list[ResearchEvidence],
) -> None:
    seen: set[str] = set()
    by_facet: dict[str, list[ResearchEvidence]] = {}
    for evidence in evidences:
        by_facet.setdefault(evidence.facet_id, []).append(evidence)
    for evidence in sorted(evidences, key=lambda item: item.confidence, reverse=True):
        key = evidence.claim.casefold()
        if key in seen:
            continue
        seen.add(key)
        bundle.findings.append(f"{evidence.claim} [{evidence.evidence_id}]")
        if len(bundle.findings) >= 6:
            break
    if not bundle.findings and sources:
        bundle.findings.extend(source.title for source in sources[:3])
    if by_facet:
        bundle.tables.append(
            ResearchTable(
                table_id="general-evidence-map",
                title="Evidence map",
                columns=["Facet", "Evidence", "Source"],
                rows=[
                    [
                        facet_id,
                        evidence_list[0].claim[:80],
                        _source_label(evidence_list[0].source_id, sources),
                    ]
                    for facet_id, evidence_list in by_facet.items()
                    if evidence_list
                ],
                notes=["Each row highlights the strongest evidence captured for a research facet."],
            )
        )
    if sources:
        bundle.tables.append(
            ResearchTable(
                table_id="general-source-coverage",
                title="Source coverage",
                columns=["Source", "Domain", "Signals"],
                rows=[
                    [
                        source.title[:72],
                        source.domain,
                        ", ".join(_numeric_signals_from_texts([source.excerpt, source.snippet])) or "textual evidence",
                    ]
                    for source in sources[:6]
                ],
                notes=[],
            )
        )
    if not sources:
        bundle.uncertainties.append("No reliable web sources were collected.")


def _mark_deliverables(bundle: AnalysisBundle, *, intent: ResearchIntent) -> None:
    has_findings = bool(bundle.findings)
    has_tables = any(table.rows for table in bundle.tables)
    has_metrics = bool(bundle.metrics)
    has_uncertainties = bool(bundle.uncertainties)
    requested_entities = intent.entities or sorted({metric.entity for metric in bundle.metrics if metric.entity})
    metrics_by_entity: dict[str, list[ResearchMetric]] = {}
    for metric in bundle.metrics:
        metrics_by_entity.setdefault(metric.entity, []).append(metric)

    table_by_id = {table.table_id: table for table in bundle.tables}
    summary_table = table_by_id.get("time-series-summary")
    comparison_table = table_by_id.get("comparison-summary") or summary_table
    evidence_map_table = table_by_id.get("general-evidence-map")
    has_verdict = any(finding.casefold().startswith("verdict:") for finding in bundle.findings)

    for item in bundle.deliverables:
        lowered = (item.title or "").casefold()
        if item.deliverable_id == "time-series-metrics":
            covered_entities = [
                entity
                for entity in requested_entities
                if _entity_has_full_metrics(metrics_by_entity.get(entity, []))
            ]
            item.satisfied = bool(requested_entities) and len(covered_entities) == len(requested_entities)
            item.details = f"Entities with full metrics: {len(covered_entities)}/{len(requested_entities)}."
        elif item.deliverable_id == "time-series-table":
            row_count = len(summary_table.rows) if summary_table else 0
            required_rows = max(1, len(requested_entities))
            item.satisfied = row_count >= required_rows
            item.details = f"Summary table rows: {row_count}/{required_rows}."
        elif item.deliverable_id == "time-series-narrative":
            entity_mentions = sum(
                1
                for entity in requested_entities
                if any(entity.casefold() in finding.casefold() for finding in bundle.findings)
            )
            has_comparison_line = any(
                "outperformed" in finding.casefold() or "percentage points" in finding.casefold()
                for finding in bundle.findings
            )
            item.satisfied = bool(requested_entities) and entity_mentions >= len(requested_entities) and (
                len(requested_entities) < 2 or has_comparison_line
            )
            item.details = (
                f"Entity findings: {entity_mentions}/{len(requested_entities)}"
                + (f"; comparison line: {'yes' if has_comparison_line else 'no'}" if len(requested_entities) > 1 else ".")
            )
        elif item.deliverable_id == "comparison-table":
            row_count = len(comparison_table.rows) if comparison_table else 0
            required_rows = max(1, len(requested_entities))
            item.satisfied = row_count >= required_rows if item.required or intent.requires_tabular_output else has_tables
            item.details = f"Comparison rows: {row_count}/{required_rows}."
        elif item.deliverable_id == "general-evidence-map":
            row_count = len(evidence_map_table.rows) if evidence_map_table else 0
            item.satisfied = row_count > 0
            item.details = f"Evidence map rows: {row_count}."
        elif item.deliverable_id == "fact-check-verdict":
            item.satisfied = has_verdict
            item.details = "Verdict statement is present." if item.satisfied else "Verdict statement is missing."
        elif "caveat" in lowered or "limitation" in lowered:
            item.satisfied = has_uncertainties or not item.required
            item.details = (
                "Caveats are not required for this result."
                if item.satisfied and not has_uncertainties
                else None
            )
        elif item.kind in {"narrative", "comparison", "verdict"}:
            item.satisfied = has_findings
        elif item.kind == "table":
            item.satisfied = has_tables
        elif item.kind == "metrics":
            item.satisfied = has_metrics
        if item.satisfied and not item.details:
            item.details = "Satisfied by the collected analysis artifacts."
        elif not item.satisfied and not item.details:
            item.details = "Still missing from the collected analysis artifacts."


def _entity_has_full_metrics(metrics: list[ResearchMetric]) -> bool:
    names = {metric.name for metric in metrics}
    required = {"start_price", "end_price", "absolute_change", "percent_change"}
    return required.issubset(names)


def _derive_entities_from_sources(sources: list[ResearchSource]) -> list[str]:
    entities: list[str] = []
    for source in sources:
        token = source.title.split(" ", 1)[0].strip().upper()
        if token and token not in entities:
            entities.append(token)
        if len(entities) >= 4:
            break
    return entities


def _entity_sources(
    entity: str,
    intent: ResearchIntent,
    sources: list[ResearchSource],
) -> list[ResearchSource]:
    aliases = _entity_aliases(entity)
    matched = []
    for source in sources:
        haystack = " ".join([source.title, source.snippet, source.excerpt]).casefold()
        if any(alias in haystack for alias in aliases):
            matched.append(source)
    return matched


def _entity_evidences(
    entity: str,
    intent: ResearchIntent,
    evidences: list[ResearchEvidence],
    sources: list[ResearchSource],
) -> list[ResearchEvidence]:
    source_map = {source.source_id: source for source in sources}
    aliases = _entity_aliases(entity)
    matched = []
    for evidence in evidences:
        source = source_map.get(evidence.source_id)
        haystack = " ".join(
            [
                evidence.claim,
                evidence.excerpt,
                source.title if source else "",
                source.snippet if source else "",
            ]
        ).casefold()
        if any(alias in haystack for alias in aliases):
            matched.append(evidence)
    return matched


def _entity_aliases(entity: str) -> list[str]:
    upper = (entity or "").upper()
    aliases = {upper.casefold()}
    if upper == "BTC":
        aliases.update({"bitcoin", "биткоин", "btc"})
    elif upper == "ETH":
        aliases.update({"ethereum", "ether", "эфир", "eth"})
    elif upper == "SOL":
        aliases.update({"solana", "sol"})
    elif upper == "XRP":
        aliases.update({"ripple", "xrp"})
    return sorted(aliases)


def _numeric_signals_from_texts(texts: list[str]) -> list[str]:
    found: list[str] = []
    for text in texts:
        for match in _PERCENT_RE.findall(text or ""):
            candidate = f"{match}%"
            if candidate not in found:
                found.append(candidate)
        if found:
            continue
        for match in _NUMBER_RE.findall(text or ""):
            candidate = re.sub(r"\s+", "", match).replace(",", ".")
            if candidate and candidate not in found:
                found.append(candidate)
        if len(found) >= 4:
            break
    return found[:4]


def _render_plain_table(columns: list[str], rows: list[list[str]]) -> str:
    grid = [columns, *rows]
    widths = [max(len(str(row[index])) for row in grid if index < len(row)) for index in range(len(columns))]
    rendered = []
    for row_index, row in enumerate(grid):
        padded = [
            str(row[index] if index < len(row) else "").ljust(widths[index])
            for index in range(len(columns))
        ]
        rendered.append(" | ".join(padded))
        if row_index == 0:
            rendered.append("-+-".join("-" * width for width in widths))
    return "\n".join(rendered)


def _source_label(source_id: str, sources: list[ResearchSource]) -> str:
    for source in sources:
        if source.source_id == source_id:
            return source.title[:72]
    return source_id

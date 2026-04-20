from __future__ import annotations

import re

from app.services.research.contracts import (
    ResearchIntent,
    ResearchMetric,
    ResearchPresentation,
    ResearchPresentationSection,
    ResearchSource,
    ResearchTable,
)

_CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")
_EVIDENCE_TAG_RE = re.compile(r"\s*\[[A-Z]\d[^\]]*\]([.!?])?\s*$")

_HIDDEN_TABLE_IDS = {
    "general-evidence-map",
    "general-source-coverage",
    "comparison-evidence-map",
    "time-series-deliverables",
}

_METRIC_PRIORITY = {
    "percent_change": 0,
    "absolute_change": 1,
    "end_price": 2,
    "start_price": 3,
    "high": 4,
    "low": 5,
}

_LIMITATION_MAP_RU = {
    "The session did not collect any reliable web sources.": "\u041d\u0430\u0434\u0435\u0436\u043d\u044b\u0445 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432 \u043e\u043a\u0430\u0437\u0430\u043b\u043e\u0441\u044c \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0432\u044b\u0432\u043e\u0434 \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043d\u044b\u043c.",
    "No reliable web sources were collected.": "\u041d\u0430\u0434\u0435\u0436\u043d\u044b\u0445 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432 \u043e\u043a\u0430\u0437\u0430\u043b\u043e\u0441\u044c \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0432\u044b\u0432\u043e\u0434 \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043d\u044b\u043c.",
    "No evidence was collected to verify the claim.": "\u0414\u043b\u044f \u043f\u0440\u044f\u043c\u043e\u0439 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 \u0432\u044b\u0432\u043e\u0434\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0445\u0432\u0430\u0442\u0438\u043b\u043e \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0439.",
    "Structured time-series data was not available, so the response falls back to source-based comparison instead of full quantitative analysis.": "\u041f\u043e\u043b\u043d\u043e\u0433\u043e \u0447\u0438\u0441\u043b\u043e\u0432\u043e\u0433\u043e \u0440\u044f\u0434\u0430 \u043d\u0435 \u043d\u0430\u0448\u043b\u043e\u0441\u044c, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435 \u043e\u043f\u0438\u0440\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438, \u0430 \u043d\u0435 \u043d\u0430 \u043f\u043e\u043b\u043d\u044b\u0439 \u0447\u0438\u0441\u043b\u043e\u0432\u043e\u0439 \u0440\u0430\u0441\u0447\u0451\u0442.",
    "Not enough evidence extracted for this facet.": "\u041f\u043e \u043e\u0434\u043d\u043e\u0439 \u0438\u0437 \u0447\u0430\u0441\u0442\u0435\u0439 \u0432\u043e\u043f\u0440\u043e\u0441\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043c\u0430\u043b\u043e.",
    "Not enough source diversity collected for this facet.": "\u041f\u043e \u043e\u0434\u043d\u043e\u0439 \u0438\u0437 \u0447\u0430\u0441\u0442\u0435\u0439 \u0432\u043e\u043f\u0440\u043e\u0441\u0430 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u043e\u043a\u0430\u0437\u0430\u043b\u0438\u0441\u044c \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043e\u0434\u043d\u043e\u0442\u0438\u043f\u043d\u044b\u043c\u0438.",
}

_LIMITATION_MAP_EN = {
    "The session did not collect any reliable web sources.": "Reliable sources were limited, so confidence is lower than usual.",
    "No reliable web sources were collected.": "Reliable sources were limited, so confidence is lower than usual.",
    "No evidence was collected to verify the claim.": "There was not enough direct evidence to verify the claim.",
    "Structured time-series data was not available, so the response falls back to source-based comparison instead of full quantitative analysis.": "A complete numeric time series was unavailable, so the comparison relies on source evidence instead.",
    "Not enough evidence extracted for this facet.": "One part of the question still has thin supporting evidence.",
    "Not enough source diversity collected for this facet.": "One part of the question is covered by too few independent sources.",
}

_VERDICT_PREFIXES = (
    "verdict:",
    "\u0432\u0435\u0440\u0434\u0438\u043a\u0442:",
    "\u0438\u0442\u043e\u0433:",
)


def build_research_presentation(
    *,
    query: str,
    intent: ResearchIntent,
    summary: str,
    findings: list[str],
    uncertainties: list[str],
    tables: list[ResearchTable],
    metrics: list[ResearchMetric],
    sources: list[ResearchSource],
) -> ResearchPresentation:
    is_ru = _is_russian(query, summary, findings)
    labels = _labels(is_ru)

    verdict, takeaways = _split_findings(findings)
    limitations = _clean_limitations(uncertainties, is_ru=is_ru)
    primary_table = _pick_primary_table(tables)
    primary_metrics = _pick_primary_metrics(metrics)
    primary_sources = _pick_primary_sources(sources)
    resolved_summary = _resolve_summary(
        summary=summary,
        verdict=verdict,
        takeaways=takeaways,
        limitations=limitations,
        table=primary_table,
        metrics=primary_metrics,
        sources=primary_sources,
        is_ru=is_ru,
    )

    sections: list[ResearchPresentationSection] = []

    if verdict:
        sections.append(
            ResearchPresentationSection(
                section_id="verdict",
                kind="verdict",
                title=labels["verdict"],
                body=verdict,
            )
        )

    if takeaways:
        sections.append(
            ResearchPresentationSection(
                section_id="takeaways",
                kind="takeaways",
                title=labels["takeaways"],
                items=takeaways[:4],
            )
        )

    if primary_table and primary_table.rows:
        sections.append(
            ResearchPresentationSection(
                section_id="table",
                kind="table",
                title=primary_table.title or labels["table"],
                table=primary_table,
            )
        )

    if primary_metrics:
        sections.append(
            ResearchPresentationSection(
                section_id="metrics",
                kind="metrics",
                title=labels["numbers"],
                metrics=primary_metrics,
            )
        )

    if limitations:
        sections.append(
            ResearchPresentationSection(
                section_id="limitations",
                kind="limitations",
                title=labels["limitations"],
                items=limitations[:3],
            )
        )

    if primary_sources:
        sections.append(
            ResearchPresentationSection(
                section_id="sources",
                kind="sources",
                title=labels["sources"],
                sources=primary_sources,
            )
        )

    return ResearchPresentation(
        title=labels["title"],
        summary=resolved_summary,
        scope=_build_scope(intent),
        sections=sections,
    )


def render_research_presentation_markdown(presentation: ResearchPresentation) -> str:
    return (presentation.summary or presentation.title).strip()


def _build_scope(intent: ResearchIntent) -> list[str]:
    scope: list[str] = []
    if intent.entities:
        scope.append(", ".join(str(entity).strip() for entity in intent.entities[:4] if str(entity).strip()))
    if intent.comparison_axis:
        axis = str(intent.comparison_axis or "").strip()
        if axis:
            scope.append(axis)
    if intent.time_range and intent.time_range.label:
        label = str(intent.time_range.label or "").strip()
        if label:
            scope.append(label)
    return scope[:4]


def _split_findings(findings: list[str]) -> tuple[str | None, list[str]]:
    verdict: str | None = None
    takeaways: list[str] = []
    seen: set[str] = set()

    for item in findings:
        cleaned = _clean_sentence(item)
        if not cleaned:
            continue

        lowered = cleaned.casefold()
        if verdict is None:
            for prefix in _VERDICT_PREFIXES:
                if lowered.startswith(prefix):
                    verdict = cleaned.split(":", 1)[1].strip()
                    break
        if verdict and cleaned == verdict:
            continue
        if any(lowered.startswith(prefix) for prefix in _VERDICT_PREFIXES):
            continue

        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        takeaways.append(cleaned)
        if len(takeaways) >= 6:
            break

    return verdict, takeaways


def _clean_limitations(items: list[str], *, is_ru: bool) -> list[str]:
    mapping = _LIMITATION_MAP_RU if is_ru else _LIMITATION_MAP_EN
    seen: set[str] = set()
    result: list[str] = []

    for item in items:
        raw = str(item or "").strip()
        if not raw:
            continue
        cleaned = _clean_sentence(mapping.get(raw, raw))
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
        if len(result) >= 4:
            break

    return result


def _pick_primary_table(tables: list[ResearchTable]) -> ResearchTable | None:
    visible = [
        table
        for table in tables
        if table.rows and table.table_id not in _HIDDEN_TABLE_IDS
    ]
    if not visible:
        return None

    def table_rank(table: ResearchTable) -> tuple[int, int]:
        title = (table.title or "").casefold()
        if table.table_id == "time-series-summary":
            return (0, 0)
        if table.table_id == "comparison-summary":
            return (1, 0)
        if "summary" in title or "\u0441\u0432\u043e\u0434" in title:
            return (2, 0)
        return (3, -len(table.rows))

    return sorted(visible, key=table_rank)[0]


def _pick_primary_metrics(metrics: list[ResearchMetric]) -> list[ResearchMetric]:
    seen: set[tuple[str, str]] = set()
    result: list[ResearchMetric] = []

    for metric in sorted(
        metrics,
        key=lambda item: (
            _METRIC_PRIORITY.get(item.name, 99),
            (item.entity or "").casefold(),
            (item.name or "").casefold(),
        ),
    ):
        key = ((metric.entity or "").casefold(), (metric.name or "").casefold())
        if key in seen:
            continue
        seen.add(key)
        result.append(metric)
        if len(result) >= 6:
            break

    return result


def _pick_primary_sources(sources: list[ResearchSource]) -> list[ResearchSource]:
    seen: set[str] = set()
    result: list[ResearchSource] = []

    for source in sources:
        key = str(source.url or "").strip().casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(source)
        if len(result) >= 4:
            break

    return result


def _resolve_summary(
    *,
    summary: str,
    verdict: str | None,
    takeaways: list[str],
    limitations: list[str],
    table: ResearchTable | None,
    metrics: list[ResearchMetric],
    sources: list[ResearchSource],
    is_ru: bool,
) -> str:
    cleaned = _clean_sentence(summary)
    if cleaned:
        return cleaned
    if verdict:
        return verdict
    if takeaways:
        return " ".join(takeaways[:2]).strip()
    if metrics:
        metric_summary = _format_metric_summary(metrics[0], is_ru=is_ru)
        if metric_summary:
            return metric_summary
    if limitations:
        return limitations[0]
    if table and table.title:
        title = _clean_sentence(table.title)
        if title:
            if is_ru:
                return f"\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0430 \u0441\u0432\u043e\u0434\u043a\u0430: {title}."
            return f"Prepared a concise summary table: {title}."
    if sources:
        domain = str(sources[0].domain or "").strip()
        if domain:
            if is_ru:
                return f"\u0421\u043e\u0431\u0440\u0430\u043d\u044b \u043e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0432\u044b\u0432\u043e\u0434\u044b \u043f\u043e \u043d\u0430\u0434\u0451\u0436\u043d\u044b\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c, \u0432\u043a\u043b\u044e\u0447\u0430\u044f {domain}."
            return f"The response is grounded in reliable sources, including {domain}."
    return (
        "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e."
        if is_ru
        else "Research complete."
    )


def _format_metric_summary(metric: ResearchMetric, *, is_ru: bool) -> str:
    value = str(metric.value or "").strip()
    if not value:
        return ""

    entity = str(metric.entity or "").strip()
    name = str(metric.name or "").strip().replace("_", " ")
    unit = str(metric.unit or "").strip()
    rendered_value = value if not unit or unit in value else f"{value} {unit}"

    if entity and name:
        return f"{entity}: {name} {rendered_value}."
    if entity:
        if is_ru:
            return f"\u041a\u043b\u044e\u0447\u0435\u0432\u043e\u0435 \u0447\u0438\u0441\u043b\u043e \u043f\u043e {entity}: {rendered_value}."
        return f"Key figure for {entity}: {rendered_value}."
    return rendered_value


def _clean_sentence(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "").strip())
    cleaned = _EVIDENCE_TAG_RE.sub(lambda match: match.group(1) or "", cleaned).strip()
    cleaned = cleaned.replace("`", "")
    return cleaned


def _is_russian(query: str, summary: str, findings: list[str]) -> bool:
    sample = " ".join([query or "", summary or "", *findings[:2]])
    return bool(_CYRILLIC_RE.search(sample))


def _labels(is_ru: bool) -> dict[str, str]:
    if is_ru:
        return {
            "title": "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u044f",
            "takeaways": "\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0432\u044b\u0432\u043e\u0434\u044b",
            "verdict": "\u0412\u044b\u0432\u043e\u0434",
            "numbers": "\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0446\u0438\u0444\u0440\u044b",
            "table": "\u0421\u0432\u043e\u0434\u043d\u0430\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u0430",
            "sources": "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438",
            "limitations": "\u0427\u0442\u043e \u0432\u0430\u0436\u043d\u043e \u0443\u0447\u0435\u0441\u0442\u044c",
        }
    return {
        "title": "Research result",
        "takeaways": "Key takeaways",
        "verdict": "Bottom line",
        "numbers": "Key numbers",
        "table": "Summary table",
        "sources": "Sources",
        "limitations": "What to keep in mind",
    }

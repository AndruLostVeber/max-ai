from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

try:
    from datetime import UTC
except ImportError:  # Python 3.10 compatibility
    UTC = timezone.utc

from app.services.research.contracts import (
    ResolvedTimeRange,
    ResearchDeliverable,
    ResearchFacet,
    ResearchIntent,
    ResearchPlan,
)

_COMPARE_RE = re.compile(r"\b(vs|versus|compare|сравни|сравнение|против|темпы роста)\b", re.IGNORECASE)
_TABLE_RE = re.compile(r"\b(table|таблиц|сводн)\w*", re.IGNORECASE)
_FACT_CHECK_RE = re.compile(r"(правда ли|верно ли|действительно ли|fact[\s-]?check)", re.IGNORECASE)
_QUANT_RE = re.compile(
    r"(динамик|рост|паден|доходност|performance|price|цена|котировк|доход|return)",
    re.IGNORECASE,
)
_LAST_QUARTER_RE = re.compile(r"(last quarter|за последний квартал|прошл[аоы]й квартал)", re.IGNORECASE)
_LAST_MONTH_RE = re.compile(r"(last month|за последний месяц|прошл[аоы]й месяц)", re.IGNORECASE)
_LAST_YEAR_RE = re.compile(r"(last year|за последний год|прошл[аоы]й год)", re.IGNORECASE)
_UPPER_TICKER_RE = re.compile(r"\b[A-Z]{2,6}\b")

_ENTITY_ALIASES = {
    "bitcoin": "BTC",
    "биткоин": "BTC",
    "btc": "BTC",
    "ethereum": "ETH",
    "ether": "ETH",
    "эфир": "ETH",
    "ethereum classic": "ETC",
    "eth": "ETH",
    "solana": "SOL",
    "sol": "SOL",
    "xrp": "XRP",
    "ripple": "XRP",
    "dogecoin": "DOGE",
    "doge": "DOGE",
}


def resolve_research_intent(
    query: str,
    *,
    now: datetime | None = None,
) -> ResearchIntent:
    normalized = re.sub(r"\s+", " ", query or "").strip()
    lower = normalized.casefold()
    entities = _extract_entities(normalized)
    time_range = _resolve_time_range(lower, now=now)

    requires_table = bool(_TABLE_RE.search(normalized))
    requires_comparison = bool(_COMPARE_RE.search(normalized) or len(entities) >= 2)
    requires_quantitative = bool(_QUANT_RE.search(normalized) or time_range)

    if _FACT_CHECK_RE.search(normalized):
        kind = "fact_check"
    elif requires_quantitative and (requires_comparison or time_range):
        kind = "time_series"
    elif requires_comparison:
        kind = "comparison"
    else:
        kind = "general"

    comparison_axis = None
    if re.search(r"(рост|паден|динамик|доходност|performance|return)", normalized, re.IGNORECASE):
        comparison_axis = "growth"
    elif requires_comparison:
        comparison_axis = "comparison"

    return ResearchIntent(
        kind=kind,
        entities=entities,
        comparison_axis=comparison_axis,
        requires_tabular_output=requires_table or kind == "time_series",
        requires_quantitative_analysis=requires_quantitative or kind == "time_series",
        requires_comparison=requires_comparison or kind in {"comparison", "time_series"},
        time_range=time_range,
    )


def build_deterministic_plan(
    query: str,
    intent: ResearchIntent,
    *,
    max_facets: int,
) -> ResearchPlan:
    compact = re.sub(r"\s+", " ", query).strip() or "Research topic"
    facets: list[ResearchFacet] = []
    deliverables: list[ResearchDeliverable] = []

    if intent.kind == "time_series":
        period_label = intent.time_range.label if intent.time_range else "requested period"
        entities = intent.entities[: max(1, min(max_facets - 1, 3))] or ["primary entity"]
        for index, entity in enumerate(entities, start=1):
            facet_id = f"facet-entity-{index}"
            facets.append(
                ResearchFacet(
                    facet_id=facet_id,
                    title=f"{entity} performance",
                    questions=[
                        f"What happened to {entity} during {period_label}?",
                        f"What were the key price moves for {entity} during {period_label}?",
                    ],
                    queries=[
                        f"{entity} historical price {period_label}",
                        f"{entity} performance {period_label}",
                        f"{entity} growth {period_label}",
                    ],
                )
            )

        comparison_id = "facet-comparison"
        compare_query = " vs ".join(entities) if len(entities) >= 2 else entities[0]
        facets.append(
            ResearchFacet(
                facet_id=comparison_id,
                title=f"Comparison for {period_label}",
                questions=[
                    f"Which asset performed better in {period_label}?",
                    f"What quantitative comparison can be made for {compare_query} in {period_label}?",
                ],
                queries=[
                    f"{compare_query} performance comparison {period_label}",
                    f"{compare_query} historical price comparison {period_label}",
                ],
            )
        )
        deliverables.extend(
            [
                ResearchDeliverable(
                    deliverable_id="time-series-narrative",
                    kind="narrative",
                    title="Narrative summary for the requested period",
                    facet_id=comparison_id,
                ),
                ResearchDeliverable(
                    deliverable_id="time-series-metrics",
                    kind="metrics",
                    title="Computed metrics for each requested entity",
                    facet_id=comparison_id,
                ),
                ResearchDeliverable(
                    deliverable_id="time-series-table",
                    kind="table",
                    title="Comparison table for the requested period",
                    facet_id=comparison_id,
                ),
            ]
        )
        stop_criteria = [
            "Resolve the requested time range before writing the answer",
            "Collect at least one source or dataset for each requested entity",
            "Build a comparison table before marking the research complete",
        ]
    elif intent.kind == "comparison":
        entities = intent.entities[: max(1, min(max_facets - 1, 3))] or ["Option A", "Option B"]
        for index, entity in enumerate(entities, start=1):
            facet_id = f"facet-entity-{index}"
            facets.append(
                ResearchFacet(
                    facet_id=facet_id,
                    title=f"{entity} profile",
                    questions=[
                        f"What matters most about {entity} for this comparison?",
                    ],
                    queries=[
                        f"{entity} overview",
                        f"{entity} key facts",
                    ],
                )
            )
        comparison_id = "facet-comparison"
        facets.append(
            ResearchFacet(
                facet_id=comparison_id,
                title="Cross-entity comparison",
                questions=[
                    f"How do {' vs '.join(entities)} compare?",
                ],
                queries=[
                    f"{' vs '.join(entities)} comparison",
                ],
            )
        )
        deliverables.extend(
            [
                ResearchDeliverable(
                    deliverable_id="comparison-narrative",
                    kind="comparison",
                    title="Direct comparison of the requested entities",
                    facet_id=comparison_id,
                ),
                ResearchDeliverable(
                    deliverable_id="comparison-table",
                    kind="table",
                    title="Comparison table for the requested entities",
                    facet_id=comparison_id,
                    required=intent.requires_tabular_output,
                ),
            ]
        )
        stop_criteria = [
            "Collect evidence for each compared entity",
            "Produce a direct comparison before marking the research complete",
        ]
    elif intent.kind == "fact_check":
        facet_id = "facet-fact-check"
        facets.append(
            ResearchFacet(
                facet_id=facet_id,
                title="Claim verification",
                questions=[compact],
                queries=[compact, f"{compact} evidence", f"{compact} source"],
            )
        )
        deliverables.extend(
            [
                ResearchDeliverable(
                    deliverable_id="fact-check-verdict",
                    kind="verdict",
                    title="Fact-check verdict",
                    facet_id=facet_id,
                ),
            ]
        )
        stop_criteria = [
            "Find evidence that supports or contradicts the claim",
            "Return a clear verdict or an explicit insufficiency note",
        ]
    else:
        base_id = "facet-core"
        mechanism_id = "facet-mechanism"
        evidence_id = "facet-evidence"
        limitations_id = "facet-limitations"
        facets.append(
            ResearchFacet(
                facet_id=base_id,
                title=compact[:120],
                questions=[compact, f"What is the direct answer to: {compact}?"],
                queries=[compact, f"{compact} overview", f"{compact} summary"],
            )
        )
        if max_facets > 1:
            facets.append(
                ResearchFacet(
                    facet_id=mechanism_id,
                    title="Mechanisms and drivers",
                    questions=[
                        f"What mechanisms or drivers explain {compact}?",
                        f"How does {compact} work in practice?",
                    ],
                    queries=[f"{compact} how it works", f"{compact} drivers", f"{compact} methodology"],
                )
            )
        if max_facets > 2:
            facets.append(
                ResearchFacet(
                    facet_id=evidence_id,
                    title="Evidence and examples",
                    questions=[
                        f"What strong examples, case studies, or empirical evidence exist for {compact}?",
                    ],
                    queries=[f"{compact} examples", f"{compact} case study", f"{compact} evidence"],
                )
            )
        if max_facets > 3:
            facets.append(
                ResearchFacet(
                    facet_id=limitations_id,
                    title="Limitations and caveats",
                    questions=[f"What caveats or limitations apply to {compact}?"],
                    queries=[f"{compact} limitations", f"{compact} challenges", f"{compact} risks"],
                )
            )
        deliverables.extend(
            [
                ResearchDeliverable(
                    deliverable_id="general-narrative",
                    kind="narrative",
                    title="Grounded summary of the research question",
                    facet_id=base_id,
                ),
                ResearchDeliverable(
                    deliverable_id="general-evidence-map",
                    kind="table",
                    title="Evidence map across research facets",
                    facet_id=evidence_id if max_facets > 2 else base_id,
                ),
                ResearchDeliverable(
                    deliverable_id="general-caveats",
                    kind="comparison",
                    title="Limitations or caveats section",
                    required=False,
                    facet_id=limitations_id if max_facets > 3 else mechanism_id,
                ),
            ]
        )
        stop_criteria = [
            "Collect evidence before writing the final answer",
            "Cover the core answer, supporting evidence, and caveats",
            "Do not mark the session complete without an evidence map",
        ]

    return ResearchPlan(
        intent=intent,
        facets=facets[:max_facets],
        deliverables=deliverables,
        stop_criteria=stop_criteria,
    )


def attach_deliverables(
    plan: ResearchPlan,
    *,
    deliverables: list[ResearchDeliverable],
    intent: ResearchIntent,
) -> ResearchPlan:
    return plan.model_copy(update={"intent": intent, "deliverables": deliverables})


def _extract_entities(query: str) -> list[str]:
    found: list[str] = []
    lowered = query.casefold()
    for alias, canonical in _ENTITY_ALIASES.items():
        if alias in lowered and canonical not in found:
            found.append(canonical)

    for token in _UPPER_TICKER_RE.findall(query):
        if token not in found:
            found.append(token)
    return found[:4]


def _resolve_time_range(
    query: str,
    *,
    now: datetime | None = None,
) -> ResolvedTimeRange | None:
    current = (now or datetime.now(UTC)).date()
    if _LAST_QUARTER_RE.search(query):
        return _previous_quarter_range(current)
    if _LAST_MONTH_RE.search(query):
        return _previous_month_range(current)
    if _LAST_YEAR_RE.search(query):
        start = date(current.year - 1, 1, 1)
        end = date(current.year - 1, 12, 31)
        return ResolvedTimeRange(
            label=str(current.year - 1),
            start_date=start.isoformat(),
            end_date=end.isoformat(),
            grain="year",
        )
    return None


def _previous_quarter_range(today: date) -> ResolvedTimeRange:
    quarter = ((today.month - 1) // 3) + 1
    if quarter == 1:
        year = today.year - 1
        prev_quarter = 4
    else:
        year = today.year
        prev_quarter = quarter - 1

    start_month = (prev_quarter - 1) * 3 + 1
    start = date(year, start_month, 1)
    if prev_quarter == 4:
        end = date(year, 12, 31)
    else:
        next_start = date(year, start_month + 3, 1)
        end = next_start - timedelta(days=1)
    return ResolvedTimeRange(
        label=f"Q{prev_quarter} {year}",
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        grain="quarter",
    )


def _previous_month_range(today: date) -> ResolvedTimeRange:
    if today.month == 1:
        year = today.year - 1
        month = 12
    else:
        year = today.year
        month = today.month - 1
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return ResolvedTimeRange(
        label=start.strftime("%B %Y"),
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        grain="month",
    )

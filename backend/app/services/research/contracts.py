from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


ResearchSessionStatus = Literal[
    "queued",
    "planning",
    "collecting",
    "extracting",
    "evaluating",
    "writing",
    "completed",
    "failed",
    "cancelled",
]

ResearchIntentKind = Literal[
    "general",
    "comparison",
    "fact_check",
    "time_series",
]

ResearchEventType = Literal[
    "session_started",
    "plan_ready",
    "sources_discovered",
    "sources_selected",
    "evidence_extracted",
    "coverage_updated",
    "iteration_completed",
    "answer_ready",
    "completed",
    "failed",
    "cancelled",
]

ResearchOutputMode = Literal["brief", "report"]
ResearchDeliverableKind = Literal["narrative", "table", "metrics", "comparison", "verdict"]
ResearchPresentationSectionKind = Literal[
    "summary",
    "takeaways",
    "verdict",
    "metrics",
    "table",
    "sources",
    "limitations",
]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ResearchContextMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ResearchCreateRequest(BaseModel):
    query: str
    user_id: str = "anonymous"
    conversation_id: str | None = None
    conversation_context: list[ResearchContextMessage] = Field(default_factory=list)
    memory_context: str | None = None
    max_iterations: int = Field(default=2, ge=1, le=4)
    max_facets: int = Field(default=4, ge=1, le=6)
    max_sources: int = Field(default=8, ge=1, le=12)
    output_mode: ResearchOutputMode = "report"


class ResolvedTimeRange(BaseModel):
    label: str = ""
    start_date: str | None = None
    end_date: str | None = None
    grain: Literal["none", "day", "month", "quarter", "year"] = "none"


class ResearchIntent(BaseModel):
    kind: ResearchIntentKind = "general"
    entities: list[str] = Field(default_factory=list)
    comparison_axis: str | None = None
    requires_tabular_output: bool = False
    requires_quantitative_analysis: bool = False
    requires_comparison: bool = False
    time_range: ResolvedTimeRange | None = None


class ResearchFacet(BaseModel):
    facet_id: str
    title: str
    questions: list[str] = Field(default_factory=list)
    queries: list[str] = Field(default_factory=list)


class ResearchDeliverable(BaseModel):
    deliverable_id: str
    kind: ResearchDeliverableKind
    title: str
    required: bool = True
    satisfied: bool = False
    facet_id: str | None = None
    details: str | None = None


class ResearchPlan(BaseModel):
    intent: ResearchIntent | None = None
    facets: list[ResearchFacet] = Field(default_factory=list)
    deliverables: list[ResearchDeliverable] = Field(default_factory=list)
    stop_criteria: list[str] = Field(default_factory=list)


class ResearchSource(BaseModel):
    source_id: str
    facet_id: str
    title: str
    url: str
    domain: str
    snippet: str = ""
    excerpt: str = ""
    relevance_score: float = 0.0
    quality_score: float = 0.0


class ResearchEvidence(BaseModel):
    evidence_id: str
    facet_id: str
    source_id: str
    claim: str
    excerpt: str
    stance: Literal["supports", "contradicts", "context"] = "context"
    confidence: float = 0.5


class ResearchMetric(BaseModel):
    metric_id: str
    entity: str
    name: str
    value: str
    unit: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class ResearchTable(BaseModel):
    table_id: str
    title: str
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ResearchCoverage(BaseModel):
    facet_id: str
    evidence_count: int = 0
    domain_count: int = 0
    complete: bool = False
    notes: list[str] = Field(default_factory=list)


class ResearchPresentationSection(BaseModel):
    section_id: str
    kind: ResearchPresentationSectionKind
    title: str
    body: str | None = None
    items: list[str] = Field(default_factory=list)
    metrics: list[ResearchMetric] = Field(default_factory=list)
    table: ResearchTable | None = None
    sources: list[ResearchSource] = Field(default_factory=list)


class ResearchPresentation(BaseModel):
    title: str
    summary: str
    scope: list[str] = Field(default_factory=list)
    sections: list[ResearchPresentationSection] = Field(default_factory=list)


class ResearchStats(BaseModel):
    iterations_completed: int = 0
    queries_generated: int = 0
    sources_discovered: int = 0
    sources_selected: int = 0
    evidences_extracted: int = 0
    metrics_computed: int = 0
    tables_built: int = 0
    deliverables_total: int = 0
    deliverables_satisfied: int = 0
    duration_ms: int = 0
    stop_reason: str | None = None


class ResearchError(BaseModel):
    code: str
    message: str


class ResearchResult(BaseModel):
    answer: str
    intent: ResearchIntent | None = None
    findings: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    deliverables: list[ResearchDeliverable] = Field(default_factory=list)
    tables: list[ResearchTable] = Field(default_factory=list)
    metrics: list[ResearchMetric] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)
    evidences: list[ResearchEvidence] = Field(default_factory=list)
    coverage: list[ResearchCoverage] = Field(default_factory=list)
    presentation: ResearchPresentation | None = None
    stats: ResearchStats = Field(default_factory=ResearchStats)


class ResearchSession(BaseModel):
    session_id: str
    status: ResearchSessionStatus
    request: ResearchCreateRequest
    intent: ResearchIntent | None = None
    plan: ResearchPlan | None = None
    stats: ResearchStats = Field(default_factory=ResearchStats)
    result: ResearchResult | None = None
    error: ResearchError | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ResearchEvent(BaseModel):
    type: ResearchEventType
    session_id: str
    status: ResearchSessionStatus
    payload: dict[str, Any] = Field(default_factory=dict)
    emitted_at: datetime = Field(default_factory=utcnow)

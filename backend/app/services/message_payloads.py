from __future__ import annotations

import json
import re
from typing import Any


STORED_MESSAGE_PREFIX = "[[MTS_MESSAGE_V1]]"
_WHITESPACE_RE = re.compile(r"\s+")
_EVIDENCE_TAG_RE = re.compile(r"\s*\[[A-Z]\d[^\]]*\]([.!?])?\s*$")


def _clean_message_content(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(lines).strip()


def _compact_text(value: Any, *, limit: int = 420) -> str:
    text = _WHITESPACE_RE.sub(" ", str(value or "").strip())
    text = _EVIDENCE_TAG_RE.sub(lambda match: match.group(1) or "", text).strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(80, limit - 1)].rstrip()}..."


def _dedupe_strings(items: list[str], *, limit: int) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        text = _compact_text(item, limit=160)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def decode_stored_message_payload(content: str) -> dict[str, Any]:
    raw = str(content or "")
    if not raw.startswith(STORED_MESSAGE_PREFIX):
        return {"content": raw}

    payload_raw = raw[len(STORED_MESSAGE_PREFIX) :].strip()
    if not payload_raw:
        return {"content": ""}

    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError:
        return {"content": raw}

    if not isinstance(payload, dict):
        return {"content": raw}

    visible_content = _clean_message_content(payload.get("content", ""))
    normalized: dict[str, Any] = {"content": visible_content}
    for key in (
        "kind",
        "image",
        "research",
        "sources",
        "sub_queries",
        "stats",
        "notes",
        "isMarkdown",
        "research_query",
    ):
        if key in payload:
            normalized[key] = payload[key]
    return normalized


def summarize_research_payload(
    research: dict[str, Any] | None,
    *,
    question: str | None = None,
    limit: int = 420,
) -> str:
    if not isinstance(research, dict):
        return ""

    presentation = research.get("presentation") if isinstance(research.get("presentation"), dict) else {}
    presentation_summary = _compact_text(presentation.get("summary", ""), limit=180)
    presentation_sections = presentation.get("sections") if isinstance(presentation.get("sections"), list) else []
    presentation_takeaways: list[str] = []
    for section in presentation_sections:
        if not isinstance(section, dict):
            continue
        kind = str(section.get("kind", "")).strip()
        if kind == "verdict":
            body = _compact_text(section.get("body", ""), limit=160)
            if body:
                presentation_takeaways.append(body)
        elif kind == "takeaways":
            for item in section.get("items", []):
                if isinstance(item, str):
                    presentation_takeaways.append(item)
                    if len(presentation_takeaways) >= 3:
                        break
        if len(presentation_takeaways) >= 3:
            break

    findings = _dedupe_strings(
        presentation_takeaways
        + [item for item in research.get("findings", []) if isinstance(item, str)],
        limit=3,
    )
    tables = [
        str(item.get("title", "")).strip()
        for item in research.get("tables", [])
        if isinstance(item, dict) and item.get("title")
    ][:1]
    if not tables:
        tables = [
            str(section.get("title", "")).strip()
            for section in presentation_sections
            if isinstance(section, dict)
            and str(section.get("kind", "")).strip() == "table"
            and section.get("title")
        ][:1]
    sources = [
        str(item.get("domain", "") or item.get("title", "")).strip()
        for item in research.get("sources", [])
        if isinstance(item, dict)
    ]
    intent = research.get("intent") if isinstance(research.get("intent"), dict) else {}
    entities = [
        str(item).strip()
        for item in intent.get("entities", [])
        if str(item).strip()
    ][:4]
    time_range = intent.get("time_range") if isinstance(intent.get("time_range"), dict) else {}
    time_label = str(time_range.get("label", "")).strip()

    metrics_preview: list[str] = []
    for metric in research.get("metrics", []):
        if not isinstance(metric, dict):
            continue
        entity = str(metric.get("entity", "")).strip()
        value = str(metric.get("value", "")).strip()
        unit = str(metric.get("unit", "")).strip()
        name = str(metric.get("name", "")).strip().replace("_", " ")
        if not value:
            continue
        label = " ".join(part for part in [entity, name] if part).strip()
        metric_text = f"{label}: {value}{f' {unit}' if unit and unit not in value else ''}".strip()
        metrics_preview.append(metric_text)
        if len(metrics_preview) >= 3:
            break

    parts: list[str] = []
    normalized_question = _compact_text(question or "", limit=150)
    if normalized_question:
        parts.append(f"Topic: {normalized_question}")
    if entities:
        parts.append(f"Entities: {', '.join(entities)}")
    if time_label:
        parts.append(f"Period: {time_label}")
    if presentation_summary:
        parts.append(f"Summary: {presentation_summary}")
    if findings:
        parts.append(f"Findings: {'; '.join(findings)}")
    if tables:
        parts.append(f"Table: {tables[0]}")
    if metrics_preview:
        parts.append(f"Numbers: {'; '.join(metrics_preview)}")
    if sources:
        unique_sources = _dedupe_strings(sources, limit=3)
        if unique_sources:
            parts.append(f"Sources: {', '.join(unique_sources)}")
    return _compact_text(" | ".join(parts), limit=limit)


def build_context_content_from_stored_message(content: str, *, role: str | None = None) -> str:
    payload = decode_stored_message_payload(content)
    if role == "assistant" and isinstance(payload.get("research"), dict):
        summary = summarize_research_payload(
            payload.get("research"),
            question=payload.get("research_query"),
            limit=420,
        )
        if summary:
            return summary
    return _compact_text(payload.get("content", ""), limit=420)

from __future__ import annotations
"""
POST /v1/parse  — extract text from uploaded document.
Supported: PDF, DOCX, XLSX/XLS, CSV, TXT, MD
"""
import csv
import io

from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

MAX_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_CHARS = 40_000             # ~10k tokens


@router.post("/parse")
async def parse_document(file: UploadFile = File(...)):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Файл слишком большой (макс. 20 МБ)")

    name = (file.filename or "").lower()
    ct   = (file.content_type or "").lower()

    try:
        text = _extract(data, name, ct)
    except Exception as e:
        raise HTTPException(422, f"Не удалось прочитать файл: {e}")

    text = text[:MAX_CHARS]
    return {"filename": file.filename, "chars": len(text), "text": text}


def _extract(data: bytes, name: str, ct: str) -> str:
    # PDF
    if name.endswith(".pdf") or "pdf" in ct:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        return "\n\n".join(text_parts)

    # DOCX
    if name.endswith(".docx") or "wordprocessingml" in ct or "docx" in ct:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    # XLSX / XLS
    if name.endswith((".xlsx", ".xls")) or "spreadsheet" in ct or "excel" in ct:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        rows = []
        for ws in wb.worksheets:
            rows.append(f"[Лист: {ws.title}]")
            for row in ws.iter_rows(values_only=True):
                cells = [str(c) if c is not None else "" for c in row]
                if any(cells):
                    rows.append("\t".join(cells))
        return "\n".join(rows)

    # CSV
    if name.endswith(".csv") or "csv" in ct:
        text = data.decode("utf-8", errors="replace")
        reader = csv.reader(io.StringIO(text))
        return "\n".join("\t".join(row) for row in reader)

    # TXT / MD / any text
    return data.decode("utf-8", errors="replace")

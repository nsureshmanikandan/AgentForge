# Real File Upload Parsing — Sandbox + Custom Code — Design

## Context

Live testing this session found "Upload" functionality is fake in two different places, for two different reasons:

**Sandbox preview** (generate-ui, no backend attached): confirmed in two different generated apps (Legal Contract Review Assistant, LLM Council) that the "Upload" button has a real `onClick` handler but there is no `<input type="file">` anywhere in the DOM. The handler just fires a canned success toast — e.g. Council's is literally `onClick={()=>showToast("File parsing is ready for server-side ingestion.", "success")}` — regardless of what (if anything) is selected. This mirrors the earlier sandbox EXPORT bug (fixed this session by making the EXPORT block MANDATORY with a real jsPDF/xlsx/pptxgenjs library requirement). No equivalent MANDATORY block for uploads currently exists in `UI_GEN_PROMPT`.

**Custom Code ZIP** (generate-project, the real deployable backend): the exact root cause was found by reading the current `PROJECT_BACKEND_PROMPT`'s "FILE UPLOAD — MANDATORY" template (backend/app/api/architect.py, ~line 3381-3409). GPT-4o is told to copy this template **verbatim**, and the template itself only handles `.csv`, `.xlsx`, `.txt`, `.md` — it has no `.pdf`/`.docx` branches at all, despite `PyPDF2`/`python-docx` already being required dependencies elsewhere in the same prompt, and despite plans routinely stating PDF/DOCX intake as a primary feature (e.g. Contract Review Assistant's IntakeAgent). Verified live: Contract Review's generated `upload.py` explicitly rejects `.pdf`/`.docx` with `HTTPException(400)`.

A second, worse case was found for LLM Council: its plan calls for uploads nested under a parent resource (`POST /decisions/{id}/uploads`) rather than the template's standalone `POST /upload` shape. GPT-4o didn't map the MANDATORY template to this different route shape and instead wrote its own endpoint from scratch — one that persists an upload record (filename, extension, status) but **never parses the file content at all**, for any format. The plan's explicit requirement ("Parsed content pre-fills the Context field") is entirely unmet.

## Goals

- Sandbox: when a generated app's plan describes an upload/context-file feature, the "Upload" control must be genuinely functional for CSV/XLSX — real `<input type="file">`, real client-side parsing (no backend needed, reusing the `xlsx` library already loaded for exports), real parsed preview shown to the user.
- Custom Code: the real backend upload endpoint(s) must genuinely parse all four formats the plan is likely to promise (CSV, XLSX, PDF, DOCX) using the dependencies already required (`PyPDF2`, `python-docx`, `openpyxl`), regardless of whether the endpoint is a standalone `/upload` route or nested under a parent resource.

## Non-Goals

- Sandbox PDF/DOCX parsing (would require new libraries — `pdf.js`, `mammoth.js` — not currently loaded; out of scope for this narrow pass). The sandbox instead shows an honest message that these formats are parsed server-side once deployed.
- OCR for scanned/image-based PDFs in the Custom Code backend (PyPDF2 has no OCR capability; out of scope — see Error Handling below for how this is surfaced instead of silently failing).
- Increasing `max_completion_tokens` for the backend/frontend generation passes — flagged as a related risk (see Risks section) but treated as a separate, optional follow-up, not bundled into this fix.

## Design

### Track A — Sandbox (`UI_GEN_PROMPT`)

Add a new "UPLOAD" block to the existing "MANDATORY ENTERPRISE UI STANDARDS" section, directly after the EXPORT block, but — unlike EXPORT — scoped conditionally rather than applied to all app types unconditionally:

> UPLOAD: If the plan's features or pages describe an upload/context-file/document-intake feature, it MUST be genuinely functional for CSV and XLSX:
> - Render a real (can be visually hidden) `<input type="file" accept=".csv,.xlsx" onChange={...}>`, triggered by the visible Upload button or drop zone via a ref's `.click()`.
> - On file select, read the file with `FileReader` as an ArrayBuffer, then parse with the already-loaded SheetJS library: `const wb = XLSX.read(data, {type: 'array'}); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);` — this single call handles both CSV and XLSX, so do not implement a separate manual CSV-text-splitting path.
> - Show the real parsed result (row count, column names, or a small preview table) — never a canned "success" toast unrelated to what was actually parsed.
> - If the selected file is `.pdf` or `.docx`, do not fake parsing it. Show an honest message such as "PDF/DOCX parsing runs server-side — deploy the Custom Code project to use this format."
> - FORBIDDEN: an Upload control whose only action is a toast/alert with no real file input and no real parsing — this is a fake, non-functional placeholder, exactly as forbidden for EXPORT buttons above.

### Track B — Custom Code backend (`PROJECT_BACKEND_PROMPT`)

Extend the existing "FILE UPLOAD — MANDATORY" template's code example (currently CSV/XLSX/TXT only) with real PDF/DOCX branches:

```python
elif filename.endswith(".pdf"):
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        text = "[This PDF appears to be scanned/image-based and could not be parsed as text.]"
elif filename.endswith(".docx"):
    import docx
    doc = docx.Document(io.BytesIO(content))
    text = "\n".join(p.text for p in doc.paragraphs)
```

Also strengthen the surrounding instruction text to state explicitly:

> This same parsing logic (CSV, XLSX, PDF, DOCX, TXT/MD) MUST be used inside ANY file-upload endpoint the plan requires — regardless of whether it is implemented as the standalone `POST /upload` shown above, or nested under a parent resource (e.g. `POST /decisions/{id}/uploads`, `POST /contracts/{id}/documents`). If the endpoint also persists an upload record to the database, the response MUST include both the persisted record's fields (e.g. `id`, `file_name`) AND the extracted content fields (`rows`, `text`) — merge them into one response object, never return only the metadata with the real content silently dropped.

## Error Handling

- Sandbox: selecting an unsupported format shows an explicit, honest message (never a fake success state).
- Backend: an empty-after-extraction PDF returns a clear placeholder string explaining the likely cause (scanned/image-based), rather than silently returning `""` with no indication anything went wrong. Genuinely corrupt/unreadable files should still raise `HTTPException(400)` as the existing template already does for unrecognized extensions.

## Testing / Verification Plan

Same approach as the SSO and real-data fixes in this session, since the output under test is LLM-generated code:
1. `ast.parse` / `tsc --noEmit` on generated output for both tracks.
2. Live spot-check: regenerate both previously-tested apps (Contract Review Assistant, The Council) via real API calls.
   - Sandbox: confirm a real `<input type="file">` now exists in the generated HTML, and that selecting a CSV produces a real parsed preview (not a canned toast).
   - Custom Code: confirm the generated upload endpoint(s) now contain PDF and DOCX branches, and that Council's nested `/decisions/{id}/uploads` endpoint (or whatever shape it generates) returns extracted `rows`/`text` alongside the persisted record fields.
3. Manual code review of the generated PDF branch for the empty-extraction fallback message, mirroring the SSO review's script of checking for a specific safety behavior in generated output.

## Risks

- **Prompt/completion-budget risk**: this is the fourth MANDATORY instruction now stacked onto the backend-generation pass (after real-data, SSO, and this one) with no increase to `max_completion_tokens=14000`. Flagged as a real, growing risk of truncated output on complex apps requiring many features at once — noted here as context for a possible follow-up (raising the token cap), not addressed by this design itself.
- Track A and Track B are independently testable and independently revertable; a bug in one does not block or affect the other.

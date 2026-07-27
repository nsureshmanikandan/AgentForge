"""
UI parity guard between the Architect sandbox preview and the two code
downloads (Agentic Code, RAG Template Code).

Context: across this project's testing sessions, the sandbox preview and
the two downloads repeatedly drifted out of visual sync -- an "Admin
Review Queue" panel invented only in the sandbox, a duplicated
"Attached Files"/"Knowledge Base" header, and (most recently) the
sandbox's Support Chat page having a collapsible Top 10 Questions
sidebar while both downloads' equivalent page did not. Each of these
was found by manually downloading, running, and eyeballing the result.

This module is NOT a full automated 3-way generator diff (that would
require live LLM calls for the sandbox/Agentic Code paths and a Node/TS
harness for the RAG Template's static template) -- it is the practical
first slice: a fast, static regression guard on the two known-good
facts fixed today, so this exact class of bug can't silently recur
without at least one CI test noticing.

If you add more sandbox-vs-download parity rules later, add them here
rather than starting a second file, so all parity assumptions stay in
one place.
"""
from pathlib import Path

_ARCHITECT_TSX = Path(__file__).resolve().parents[3] / "frontend" / "src" / "pages" / "Architect.tsx"


def _read_architect_tsx() -> str:
    assert _ARCHITECT_TSX.exists(), f"expected {_ARCHITECT_TSX} to exist"
    return _ARCHITECT_TSX.read_text(encoding="utf-8")


def test_downloads_use_knowledge_base_not_attached_files():
    """
    The sandbox's CHATBOT right panel is titled "Knowledge Base". Both
    downloads' equivalent panel previously said "Attached Files" instead
    -- a plain naming drift, not a different feature. Guard against it
    recurring in either of Architect.tsx's two static App.tsx templates
    (RAG Template Code's buildRagScaffoldZip and Agentic Code's
    buildSourceZip).
    """
    src = _read_architect_tsx()
    assert "Attached Files" not in src, (
        "Found 'Attached Files' in Architect.tsx -- the download templates' right panel "
        "must say 'Knowledge Base' to match the sandbox convention."
    )
    assert src.count(">Knowledge Base</p>") >= 2, (
        "Expected both the RAG Template Code and Agentic Code static App.tsx templates "
        "to render a 'Knowledge Base' panel heading."
    )


def test_downloads_have_collapsible_questions_sidebar():
    """
    The sandbox's Top 10 Questions sidebar is collapsible so it doesn't
    crowd out the chat/answer area -- both downloads' Support Chat page
    previously had no such toggle, so a narrow window left almost no
    room to read an answer. Guard against either download's template
    losing the toggle again.
    """
    src = _read_architect_tsx()
    assert src.count("questionsCollapsed") >= 2, (
        "Expected 'questionsCollapsed' state to be wired into both the RAG Template "
        "Code and Agentic Code static App.tsx templates' Top 10 Questions sidebar."
    )

import asyncio
import logging
import time
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.voice import VoiceCallLog
from app.core.security import decode_token
from app.core.azure_openai import AzureOpenAIClient
from app.core.telemetry import get_tracer
from app.config import settings

logger = logging.getLogger("agentforge.voice")

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

AZURE_SPEECH_KEY    = settings.azure_speech_key
AZURE_SPEECH_REGION = settings.azure_speech_region

# ── Models ────────────────────────────────────────────────────────────────────

class VoiceConfig(BaseModel):
    agent_id: str
    tts_engine: str = "azure"
    tts_voice: str = "en-US-JennyNeural"
    stt_engine: str = "azure"
    stt_language: str = "en-US"
    silence_timeout_ms: int = 1500
    max_call_duration_s: int = 300
    speaking_rate: float = 1.0      # 0.5 – 2.0
    pitch: float = 0.0              # -50 to +50 Hz
    persona: str = "friendly"       # formal | professional | friendly | casual
    enabled: bool = False

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "en-US-JennyNeural"
    speaking_rate: float = 1.0
    pitch: float = 0.0
    use_ssml: bool = False

class VoiceChatRequest(BaseModel):
    message: str
    agent_id: str = "default"
    session_id: str = ""
    voice: str = "en-US-JennyNeural"
    speaking_rate: float = 1.0
    pitch: float = 0.0
    persona: str = "friendly"
    history: list[dict] = []

class VoiceChatTextRequest(BaseModel):
    message: str
    agent_id: str = "default"
    session_id: str = ""
    persona: str = "friendly"
    history: list[dict] = []

# ── In-memory state ────────────────────────────────────────────────────────────

_CONFIGS: dict[str, dict] = {}
_CALL_LOGS: list[dict] = []   # [{id, session_id, agent_id, role, text, timestamp}]

# ── Voice library — 24 Azure Neural voices ────────────────────────────────────

_VOICES = [
    # English — US
    {"id": "en-US-JennyNeural",     "name": "Jenny",     "locale": "en-US", "language": "English (US)",     "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "en-US-GuyNeural",       "name": "Guy",       "locale": "en-US", "language": "English (US)",     "gender": "Male",   "style": "Conversational", "engine": "azure"},
    {"id": "en-US-AriaNeural",      "name": "Aria",      "locale": "en-US", "language": "English (US)",     "gender": "Female", "style": "Professional",   "engine": "azure"},
    {"id": "en-US-DavisNeural",     "name": "Davis",     "locale": "en-US", "language": "English (US)",     "gender": "Male",   "style": "Professional",   "engine": "azure"},
    {"id": "en-US-AmberNeural",     "name": "Amber",     "locale": "en-US", "language": "English (US)",     "gender": "Female", "style": "Friendly",       "engine": "azure"},
    # English — UK
    {"id": "en-GB-SoniaNeural",     "name": "Sonia",     "locale": "en-GB", "language": "English (UK)",     "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "en-GB-RyanNeural",      "name": "Ryan",      "locale": "en-GB", "language": "English (UK)",     "gender": "Male",   "style": "Conversational", "engine": "azure"},
    # English — AU / IN
    {"id": "en-AU-NatashaNeural",   "name": "Natasha",   "locale": "en-AU", "language": "English (AU)",     "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "en-AU-WilliamNeural",   "name": "William",   "locale": "en-AU", "language": "English (AU)",     "gender": "Male",   "style": "Conversational", "engine": "azure"},
    {"id": "en-IN-NeerjaNeural",    "name": "Neerja",    "locale": "en-IN", "language": "English (India)",  "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "en-IN-PrabhatNeural",   "name": "Prabhat",   "locale": "en-IN", "language": "English (India)",  "gender": "Male",   "style": "Conversational", "engine": "azure"},
    # European
    {"id": "es-ES-ElviraNeural",    "name": "Elvira",    "locale": "es-ES", "language": "Spanish (Spain)",  "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "es-MX-DaliaNeural",     "name": "Dalia",     "locale": "es-MX", "language": "Spanish (Mexico)", "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "fr-FR-DeniseNeural",    "name": "Denise",    "locale": "fr-FR", "language": "French",           "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "de-DE-KatjaNeural",     "name": "Katja",     "locale": "de-DE", "language": "German",           "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "de-DE-ConradNeural",    "name": "Conrad",    "locale": "de-DE", "language": "German",           "gender": "Male",   "style": "Conversational", "engine": "azure"},
    {"id": "it-IT-ElsaNeural",      "name": "Elsa",      "locale": "it-IT", "language": "Italian",          "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "pt-BR-FranciscaNeural", "name": "Francisca", "locale": "pt-BR", "language": "Portuguese (BR)",  "gender": "Female", "style": "Conversational", "engine": "azure"},
    # Asian
    {"id": "ja-JP-NanamiNeural",    "name": "Nanami",    "locale": "ja-JP", "language": "Japanese",         "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "ko-KR-SunHiNeural",     "name": "Sun-Hi",    "locale": "ko-KR", "language": "Korean",           "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "zh-CN-XiaoxiaoNeural",  "name": "Xiaoxiao",  "locale": "zh-CN", "language": "Chinese (Mandarin)","gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "zh-CN-YunxiNeural",     "name": "Yunxi",     "locale": "zh-CN", "language": "Chinese (Mandarin)","gender": "Male",   "style": "Conversational", "engine": "azure"},
    # Middle East / Africa
    {"id": "ar-SA-ZariyahNeural",   "name": "Zariyah",   "locale": "ar-SA", "language": "Arabic",           "gender": "Female", "style": "Conversational", "engine": "azure"},
    {"id": "hi-IN-SwaraNeural",     "name": "Swara",     "locale": "hi-IN", "language": "Hindi",            "gender": "Female", "style": "Conversational", "engine": "azure"},
]

_STT_LANGUAGES = [
    {"code": "en-US", "label": "English (US)"},
    {"code": "en-GB", "label": "English (UK)"},
    {"code": "en-IN", "label": "English (India)"},
    {"code": "en-AU", "label": "English (AU)"},
    {"code": "es-ES", "label": "Spanish"},
    {"code": "fr-FR", "label": "French"},
    {"code": "de-DE", "label": "German"},
    {"code": "it-IT", "label": "Italian"},
    {"code": "pt-BR", "label": "Portuguese (BR)"},
    {"code": "ja-JP", "label": "Japanese"},
    {"code": "ko-KR", "label": "Korean"},
    {"code": "zh-CN", "label": "Chinese (Mandarin)"},
    {"code": "hi-IN", "label": "Hindi"},
    {"code": "ar-SA", "label": "Arabic"},
]

_PERSONA_PROMPTS = {
    "formal":       "You are a formal, professional voice assistant. Speak in complete sentences, avoid contractions, and maintain a polished tone.",
    "professional": "You are a professional voice assistant. Be clear, concise, and helpful. Use business-appropriate language.",
    "friendly":     "You are a friendly, warm voice assistant. Be conversational, approachable, and encouraging. Use natural language.",
    "casual":       "You are a casual, relaxed voice assistant. Speak naturally like a knowledgeable friend. Keep responses brief and easy to understand.",
}

# ── SSML builder ──────────────────────────────────────────────────────────────

def _build_ssml(text: str, voice: str, speaking_rate: float, pitch: float) -> str:
    rate_pct = f"{int((speaking_rate - 1.0) * 100):+d}%"
    pitch_hz  = f"{int(pitch):+d}Hz"
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
        f'<voice name="{voice}">'
        f'<prosody rate="{rate_pct}" pitch="{pitch_hz}">'
        f'{text}'
        f'</prosody></voice></speak>'
    )

# ── Core synthesizer ──────────────────────────────────────────────────────────

def _synthesize_sync(text: str, voice: str, speaking_rate: float = 1.0, pitch: float = 0.0) -> bytes:
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        raise RuntimeError("azure-cognitiveservices-speech not installed. Run: pip install azure-cognitiveservices-speech")

    speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
    )
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)

    # Use SSML when rate/pitch differ from defaults
    if abs(speaking_rate - 1.0) > 0.01 or abs(pitch) > 0.5:
        ssml = _build_ssml(text, voice, speaking_rate, pitch)
        result = synthesizer.speak_ssml_async(ssml).get()
    else:
        speech_config.speech_synthesis_voice_name = voice
        result = synthesizer.speak_text_async(text).get()

    if result.reason.name == "SynthesizingAudioCompleted":
        return result.audio_data
    if result.reason.name == "Canceled":
        details = result.cancellation_details
        raise RuntimeError(f"Speech synthesis canceled: {details.reason} — {details.error_details}")
    raise RuntimeError("Speech synthesis failed")

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/voices")
async def list_voices():
    return _VOICES

@router.get("/stt-languages")
async def list_stt_languages():
    return _STT_LANGUAGES

@router.get("/configs")
async def list_configs(current_user: User = Depends(get_current_user)):
    return list(_CONFIGS.values())

@router.get("/configs/{agent_id}")
async def get_config(agent_id: str, current_user: User = Depends(get_current_user)):
    cfg = _CONFIGS.get(agent_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    return cfg

@router.put("/configs/{agent_id}")
async def upsert_config(agent_id: str, body: VoiceConfig, current_user: User = Depends(get_current_user)):
    _CONFIGS[agent_id] = body.model_dump()
    return _CONFIGS[agent_id]

@router.post("/synthesize")
async def synthesize(body: SynthesizeRequest, current_user: User = Depends(get_current_user)):
    """Synthesize text (or SSML) to speech — supports rate, pitch, and SSML."""
    if not AZURE_SPEECH_KEY:
        raise HTTPException(status_code=503, detail="Azure Speech key not configured")

    tracer = get_tracer()
    with tracer.start_as_current_span("voice.synthesize") as span:
        span.set_attribute("voice.id", body.voice)
        span.set_attribute("voice.speaking_rate", body.speaking_rate)
        span.set_attribute("voice.pitch", body.pitch)
        span.set_attribute("voice.text_length", len(body.text))
        t0 = time.time()
        logger.info("TTS synthesize | voice=%s rate=%.1f pitch=%.0f chars=%d user=%s",
                    body.voice, body.speaking_rate, body.pitch, len(body.text), current_user.email)
        try:
            loop = asyncio.get_event_loop()
            audio_data = await loop.run_in_executor(
                None, _synthesize_sync, body.text, body.voice, body.speaking_rate, body.pitch
            )
        except RuntimeError as exc:
            span.record_exception(exc)
            span.set_attribute("error", True)
            raise HTTPException(status_code=500, detail=str(exc))
        dur_ms = int((time.time() - t0) * 1000)
        span.set_attribute("voice.audio_bytes", len(audio_data))
        span.set_attribute("voice.duration_ms", dur_ms)
        logger.info("TTS synthesize complete | bytes=%d duration_ms=%d", len(audio_data), dur_ms)

    return StreamingResponse(
        iter([audio_data]),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )

@router.post("/chat-text")
async def voice_chat_text(
    body: VoiceChatTextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Text → GPT-4o (with persona) → text reply. Frontend handles TTS."""
    session_id = body.session_id or str(uuid.uuid4())
    persona_system = _PERSONA_PROMPTS.get(body.persona, _PERSONA_PROMPTS["friendly"])

    tracer = get_tracer()
    with tracer.start_as_current_span("voice.chat_text") as span:
        span.set_attribute("voice.session_id", session_id)
        span.set_attribute("voice.agent_id", body.agent_id)
        span.set_attribute("voice.persona", body.persona)
        span.set_attribute("voice.history_turns", len(body.history))
        span.set_attribute("voice.message_length", len(body.message))
        t0 = time.time()
        logger.info("Voice chat-text | session=%s agent=%s persona=%s user=%s msg_len=%d",
                    session_id[:8], body.agent_id, body.persona, current_user.email, len(body.message))

        messages = [{"role": "system", "content": persona_system}]
        for h in body.history[-10:]:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": body.message})

        try:
            client = AzureOpenAIClient(model="gpt-4o")
            reply = await client.chat(messages, temperature=0.7, max_tokens=300)
        except Exception as exc:
            span.record_exception(exc)
            span.set_attribute("error", True)
            raise HTTPException(status_code=500, detail=str(exc))

        llm_ms = int((time.time() - t0) * 1000)
        span.set_attribute("voice.reply_length", len(reply))
        span.set_attribute("voice.llm_duration_ms", llm_ms)
        logger.info("Voice chat-text reply | session=%s llm_ms=%d reply_len=%d",
                    session_id[:8], llm_ms, len(reply))

        now = datetime.utcnow()
        ts = now.isoformat()

        # Persist to PostgreSQL
        db.add(VoiceCallLog(
            id=str(uuid.uuid4()), session_id=session_id, agent_id=body.agent_id,
            role="user", text=body.message, persona=body.persona,
            llm_duration_ms=0, tts_duration_ms=0, timestamp=now,
        ))
        db.add(VoiceCallLog(
            id=str(uuid.uuid4()), session_id=session_id, agent_id=body.agent_id,
            role="assistant", text=reply, persona=body.persona,
            llm_duration_ms=llm_ms, tts_duration_ms=0, timestamp=now,
        ))
        await db.commit()

        # Also keep in-memory cache for fast reads
        _CALL_LOGS.append({"id": str(uuid.uuid4()), "session_id": session_id, "agent_id": body.agent_id,
                            "role": "user", "text": body.message, "timestamp": ts,
                            "llm_duration_ms": 0, "tts_duration_ms": 0, "persona": body.persona})
        _CALL_LOGS.append({"id": str(uuid.uuid4()), "session_id": session_id, "agent_id": body.agent_id,
                            "role": "assistant", "text": reply, "timestamp": ts,
                            "llm_duration_ms": llm_ms, "tts_duration_ms": 0, "persona": body.persona})

    return {"session_id": session_id, "reply": reply, "llm_duration_ms": llm_ms}

@router.post("/chat")
async def voice_chat(body: VoiceChatRequest, current_user: User = Depends(get_current_user)):
    """Full pipeline: text → GPT-4o (persona) → TTS audio stream."""
    if not AZURE_SPEECH_KEY:
        raise HTTPException(status_code=503, detail="Azure Speech key not configured")

    session_id = body.session_id or str(uuid.uuid4())
    persona_system = _PERSONA_PROMPTS.get(body.persona, _PERSONA_PROMPTS["friendly"])

    tracer = get_tracer()
    with tracer.start_as_current_span("voice.chat_full_pipeline") as span:
        span.set_attribute("voice.session_id", session_id)
        span.set_attribute("voice.agent_id", body.agent_id)
        span.set_attribute("voice.persona", body.persona)
        span.set_attribute("voice.tts_voice", body.voice)
        span.set_attribute("voice.speaking_rate", body.speaking_rate)
        span.set_attribute("voice.pitch", body.pitch)
        t_total = time.time()

        # Step 1: LLM
        messages = [{"role": "system", "content": persona_system}]
        for h in body.history[-10:]:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": body.message})

        t_llm = time.time()
        try:
            client = AzureOpenAIClient(model="gpt-4o")
            reply = await client.chat(messages, temperature=0.7, max_tokens=300)
        except Exception as exc:
            span.record_exception(exc)
            span.set_attribute("error", True)
            raise HTTPException(status_code=500, detail=str(exc))
        llm_ms = int((time.time() - t_llm) * 1000)
        span.set_attribute("voice.llm_duration_ms", llm_ms)
        logger.info("Voice full-pipeline LLM | session=%s persona=%s llm_ms=%d",
                    session_id[:8], body.persona, llm_ms)

        ts = datetime.utcnow().isoformat()
        _CALL_LOGS.append({"id": str(uuid.uuid4()), "session_id": session_id, "agent_id": body.agent_id,
                            "role": "user", "text": body.message, "timestamp": ts})
        _CALL_LOGS.append({"id": str(uuid.uuid4()), "session_id": session_id, "agent_id": body.agent_id,
                            "role": "assistant", "text": reply, "timestamp": ts})

        # Step 2: TTS
        t_tts = time.time()
        try:
            loop = asyncio.get_event_loop()
            audio_data = await loop.run_in_executor(
                None, _synthesize_sync, reply, body.voice, body.speaking_rate, body.pitch
            )
        except RuntimeError as exc:
            span.record_exception(exc)
            span.set_attribute("error", True)
            raise HTTPException(status_code=500, detail=str(exc))
        tts_ms = int((time.time() - t_tts) * 1000)
        total_ms = int((time.time() - t_total) * 1000)
        span.set_attribute("voice.tts_duration_ms", tts_ms)
        span.set_attribute("voice.total_duration_ms", total_ms)
        span.set_attribute("voice.audio_bytes", len(audio_data))
        logger.info("Voice full-pipeline complete | session=%s llm_ms=%d tts_ms=%d total_ms=%d audio_bytes=%d",
                    session_id[:8], llm_ms, tts_ms, total_ms, len(audio_data))

    return StreamingResponse(
        iter([audio_data]),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=reply.mp3",
            "X-Voice-Reply-Text": reply[:500],
            "X-Voice-Session-Id": session_id,
        },
    )

@router.get("/logs")
async def get_call_logs(
    session_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Read call logs from PostgreSQL — persists across restarts."""
    q = select(VoiceCallLog).order_by(desc(VoiceCallLog.timestamp)).limit(limit)
    if session_id:
        q = q.where(VoiceCallLog.session_id == session_id)
    if agent_id:
        q = q.where(VoiceCallLog.agent_id == agent_id)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "session_id": r.session_id,
            "agent_id": r.agent_id,
            "role": r.role,
            "text": r.text,
            "persona": r.persona,
            "tts_voice": r.tts_voice,
            "llm_duration_ms": r.llm_duration_ms,
            "tts_duration_ms": r.tts_duration_ms,
            "timestamp": r.timestamp.isoformat() if r.timestamp else "",
        }
        for r in rows
    ]


@router.get("/traces")
async def get_voice_traces(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated trace view: one row per session with timing stats and turn count."""
    result = await db.execute(
        select(
            VoiceCallLog.session_id,
            VoiceCallLog.agent_id,
            VoiceCallLog.persona,
            func.count(VoiceCallLog.id).label("total_turns"),
            func.sum(VoiceCallLog.llm_duration_ms).label("total_llm_ms"),
            func.sum(VoiceCallLog.tts_duration_ms).label("total_tts_ms"),
            func.max(VoiceCallLog.llm_duration_ms).label("max_llm_ms"),
            func.min(VoiceCallLog.timestamp).label("started_at"),
            func.max(VoiceCallLog.timestamp).label("last_turn_at"),
        )
        .group_by(VoiceCallLog.session_id, VoiceCallLog.agent_id, VoiceCallLog.persona)
        .order_by(desc(func.max(VoiceCallLog.timestamp)))
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "session_id": r.session_id,
            "agent_id": r.agent_id,
            "persona": r.persona,
            "total_turns": r.total_turns,
            "total_llm_ms": round(r.total_llm_ms or 0),
            "total_tts_ms": round(r.total_tts_ms or 0),
            "avg_llm_ms": round((r.total_llm_ms or 0) / max(r.total_turns, 1)),
            "max_llm_ms": round(r.max_llm_ms or 0),
            "started_at": r.started_at.isoformat() if r.started_at else "",
            "last_turn_at": r.last_turn_at.isoformat() if r.last_turn_at else "",
        }
        for r in rows
    ]


@router.delete("/logs")
async def clear_call_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete
    await db.execute(delete(VoiceCallLog))
    await db.commit()
    _CALL_LOGS.clear()
    return {"cleared": True}

@router.get("/status")
async def voice_status(current_user: User = Depends(get_current_user)):
    configured = bool(AZURE_SPEECH_KEY)
    return {
        "configured": configured,
        "region": AZURE_SPEECH_REGION,
        "tts_ready": configured,
        "stt_ready": configured,
        "voices_count": len(_VOICES),
        "logs_count": len(_CALL_LOGS),
    }

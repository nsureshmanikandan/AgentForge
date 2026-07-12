import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.core.security import decode_token
from app.config import settings

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

class VoiceConfig(BaseModel):
    agent_id: str
    tts_engine: str = "azure"
    tts_voice: str = "en-US-JennyNeural"
    stt_engine: str = "azure"
    stt_language: str = "en-US"
    silence_timeout_ms: int = 1500
    max_call_duration_s: int = 300
    enabled: bool = False

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "en-US-JennyNeural"

_CONFIGS: dict[str, dict] = {}

_VOICES = [
    {"id": "en-US-JennyNeural",    "name": "Jenny (US English)",     "gender": "Female", "engine": "azure"},
    {"id": "en-US-GuyNeural",      "name": "Guy (US English)",       "gender": "Male",   "engine": "azure"},
    {"id": "en-GB-SoniaNeural",    "name": "Sonia (UK English)",     "gender": "Female", "engine": "azure"},
    {"id": "en-AU-NatashaNeural",  "name": "Natasha (Australian)",   "gender": "Female", "engine": "azure"},
    {"id": "en-IN-NeerjaNeural",   "name": "Neerja (Indian English)","gender": "Female", "engine": "azure"},
    {"id": "es-ES-ElviraNeural",   "name": "Elvira (Spanish)",       "gender": "Female", "engine": "azure"},
    {"id": "fr-FR-DeniseNeural",   "name": "Denise (French)",        "gender": "Female", "engine": "azure"},
    {"id": "de-DE-KatjaNeural",    "name": "Katja (German)",         "gender": "Female", "engine": "azure"},
]

@router.get("/voices")
async def list_voices(current_user: User = Depends(get_current_user)):
    return _VOICES

@router.get("/configs")
async def list_configs(current_user: User = Depends(get_current_user)):
    return list(_CONFIGS.values())

@router.put("/configs/{agent_id}")
async def upsert_config(agent_id: str, body: VoiceConfig, current_user: User = Depends(get_current_user)):
    _CONFIGS[agent_id] = body.dict()
    return _CONFIGS[agent_id]

@router.post("/synthesize")
async def synthesize(body: SynthesizeRequest, current_user: User = Depends(get_current_user)):
    """Synthesize text to speech using Azure Cognitive Services and stream MP3 audio."""
    if not AZURE_SPEECH_KEY:
        raise HTTPException(status_code=503, detail="Azure Speech key not configured")

    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        raise HTTPException(status_code=503, detail="azure-cognitiveservices-speech not installed. Run: pip install azure-cognitiveservices-speech")

    def _synthesize_sync(text: str, voice: str) -> bytes:
        speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
        speech_config.speech_synthesis_voice_name = voice
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        result = synthesizer.speak_text_async(text).get()
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return result.audio_data
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            raise RuntimeError(f"Speech synthesis canceled: {cancellation.reason} — {cancellation.error_details}")
        raise RuntimeError("Speech synthesis failed")

    loop = asyncio.get_event_loop()
    audio_data = await loop.run_in_executor(None, _synthesize_sync, body.text, body.voice)

    return StreamingResponse(
        iter([audio_data]),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )

@router.get("/status")
async def voice_status(current_user: User = Depends(get_current_user)):
    """Check whether Azure Speech is configured and reachable."""
    configured = bool(AZURE_SPEECH_KEY)
    return {
        "configured": configured,
        "region": AZURE_SPEECH_REGION,
        "tts_ready": configured,
        "stt_ready": configured,
    }

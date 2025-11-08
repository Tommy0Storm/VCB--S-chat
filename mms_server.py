from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import io
import wave
import numpy as np
import os
import random
import threading
from typing import Dict, List, Optional
from gtts import gTTS

# Attempt to auto-load environment variables from .env files
try:
    from dotenv import load_dotenv

    load_dotenv()
    print("[OK] Loaded environment variables from .env")
except ImportError:
    print("[INFO] python-dotenv not installed; environment variables from .env were not loaded")

# Try to import MMS dependencies
try:
    from transformers import VitsModel, AutoTokenizer
    import torch
    import scipy
    MMS_AVAILABLE = True
    print("[OK] MMS (Transformers) available")
except ImportError as e:
    MMS_AVAILABLE = False
    print(f"[WARNING] MMS not available: {e}")

# Try to import Transformers pipeline for AfroLID support
try:
    from transformers import pipeline
    TRANSFORMERS_PIPELINE_AVAILABLE = True
except ImportError as e:
    TRANSFORMERS_PIPELINE_AVAILABLE = False
    pipeline = None
    print(f"[WARNING] Transformers pipeline unavailable: {e}")

app = Flask(__name__)
CORS(app)

# SA Language to MMS/gTTS language code mapping
SA_LANGUAGE_CODES = {
    'en': 'eng',      # English -> MMS: eng, gTTS: en
    'af': 'afr',      # Afrikaans -> MMS: afr, gTTS: af
    'zu': 'zul',      # Zulu -> MMS: zul
    'xh': 'xho',      # Xhosa -> MMS: xho
    'nso': 'nso',     # Sepedi -> MMS: nso
    'tn': 'tsn',      # Setswana -> MMS: tsn
    'st': 'sot',      # Sesotho -> MMS: sot
    'ts': 'tso',      # Xitsonga -> MMS: tso
    'ss': 'ssw',      # siSwati -> MMS: ssw
    've': 'ven',      # Tshivenda -> MMS: ven
    'nr': 'nbl',      # isiNdebele -> MMS: nbl
}

# gTTS only supports these
GTTS_SUPPORTED = {'en', 'af'}

# Language metadata for AfroLID detection and greetings
SA_LANGUAGE_METADATA: Dict[str, Dict[str, object]] = {
    'en': {
        'name': 'English',
        'greetings': ['Hello!', 'Good day!', 'Howzit!'],
        'afrolid_labels': ['eng']
    },
    'af': {
        'name': 'Afrikaans',
        'greetings': ['Hallo!', 'Goeie dag!', 'Howzit!'],
        'afrolid_labels': ['afr']
    },
    'zu': {
        'name': 'Zulu',
        'greetings': ['Sawubona!', 'Sanibonani!', 'Yebo!'],
        'afrolid_labels': ['zul']
    },
    'xh': {
        'name': 'Xhosa',
        'greetings': ['Molo!', 'Molweni!', 'Ewe!'],
        'afrolid_labels': ['xho']
    },
    'nso': {
        'name': 'Sepedi',
        'greetings': ['Dumela!', 'Thobela!', 'Ee!'],
        'afrolid_labels': ['nso']
    },
    'tn': {
        'name': 'Setswana',
        'greetings': ['Dumela!', 'Dumelang!', 'Ee rra!'],
        'afrolid_labels': ['tsn']
    },
    'st': {
        'name': 'Sesotho',
        'greetings': ['Dumela!', 'Dumelang!', 'Kea leboha!'],
        'afrolid_labels': ['sot']
    },
    'ts': {
        'name': 'Xitsonga',
        'greetings': ['Avuxeni!', 'Xewani!', 'Ina!'],
        'afrolid_labels': ['tso']
    },
    'ss': {
        'name': 'siSwati',
        'greetings': ['Sawubona!', 'Sanibonani!', 'Yebo make!'],
        'afrolid_labels': ['ssw']
    },
    've': {
        'name': 'Tshivenda',
        'greetings': ['Ndaa!', 'Matsheloni!', 'Vho-vho!'],
        'afrolid_labels': ['ven']
    },
    'nr': {
        'name': 'isiNdebele',
        'greetings': ['Lotjhani!', 'Salibonani!', 'Yebo baba!'],
        'afrolid_labels': ['nbl']
    },
}

AFROLID_LABEL_TO_CODE: Dict[str, str] = {}
for code, metadata in SA_LANGUAGE_METADATA.items():
    for label in metadata.get('afrolid_labels', []):
        AFROLID_LABEL_TO_CODE[label.lower()] = code

AFROLID_MODEL_ID = os.getenv('AFROLID_MODEL_ID', 'UBC-NLP/afrolid_1.5')
AFROLID_TOP_K = int(os.getenv('AFROLID_TOP_K', '5'))

afrolid_pipeline = None
afrolid_lock = threading.Lock()

# Model cache
mms_models = {}

print("=" * 60)
if MMS_AVAILABLE:
    print("SA Languages TTS Server (Meta MMS + gTTS)")
    print("=" * 60)
    print(f"Supported SA languages: {', '.join(SA_LANGUAGE_CODES.keys())}")
    print("[OK] Using Meta MMS models for native SA languages")
    print("[OK] Using gTTS for English/Afrikaans")
else:
    print("SA Languages TTS Server (gTTS only)")
    print("=" * 60)
    print(f"Full support: en, af")
    print(f"[WARNING] Limited support for other SA languages")
    print("[INFO] Install transformers+torch for full MMS support")
print("=" * 60)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy', 
        'service': 'MMS Multilingual TTS Server (HF API)',
        'supported_languages': list(SA_LANGUAGE_CODES.keys())
    })

@app.route('/detect-language', methods=['POST'])
def detect_language_endpoint():
    data = request.get_json(silent=True) or {}
    text = str(data.get('text', '')).strip()

    if not text:
        detection = _fallback_detection('empty_text')
        detection['error'] = 'Text is required'
        return jsonify(detection)

    detection = detect_language_afrolid(text)
    return jsonify(detection)

def _get_language_metadata(code: str) -> Dict[str, object]:
    return SA_LANGUAGE_METADATA.get(code, SA_LANGUAGE_METADATA['en'])

def _get_language_name(code: str) -> str:
    metadata = _get_language_metadata(code)
    name = metadata.get('name')
    return name if isinstance(name, str) else 'English'

def _get_greetings(code: str) -> List[str]:
    metadata = _get_language_metadata(code)
    greetings = metadata.get('greetings', [])
    if isinstance(greetings, list) and greetings:
        return [str(greet) for greet in greetings]
    return ['Hello!']

def _fallback_detection(reason: str, candidates: Optional[List[Dict[str, object]]] = None) -> Dict[str, object]:
    code = 'en'
    return {
        'language': _get_language_name(code),
        'code': code,
        'confidence': 55.0,
        'greeting': random.choice(_get_greetings(code)),
        'source': 'fallback',
        'model': AFROLID_MODEL_ID if TRANSFORMERS_PIPELINE_AVAILABLE else None,
        'reason': reason,
        'candidates': candidates or []
    }

def _load_afrolid_pipeline():
    global afrolid_pipeline

    if not TRANSFORMERS_PIPELINE_AVAILABLE:
        return None

    if afrolid_pipeline is not None:
        return afrolid_pipeline

    with afrolid_lock:
        if afrolid_pipeline is None:
            try:
                print(f"[AFROLID] Loading language identification model: {AFROLID_MODEL_ID}")
                afrolid_pipeline = pipeline(
                    'text-classification',
                    model=AFROLID_MODEL_ID,
                    device=-1,
                    trust_remote_code=True
                )
                print(f"[AFROLID] Model ready: {AFROLID_MODEL_ID}")
            except Exception as exc:
                print(f"[AFROLID] Failed to load model: {exc}")
                afrolid_pipeline = None

    return afrolid_pipeline

def detect_language_afrolid(text: str) -> Dict[str, object]:
    cleaned_text = (text or '').strip()
    if len(cleaned_text) < 3:
        return _fallback_detection('insufficient_text')

    pipeline_instance = _load_afrolid_pipeline()
    if pipeline_instance is None:
        return _fallback_detection('pipeline_unavailable')

    try:
        predictions_raw = pipeline_instance(cleaned_text, top_k=AFROLID_TOP_K)
    except Exception as exc:
        print(f"[AFROLID] Detection error: {exc}")
        return _fallback_detection('pipeline_runtime_error')

    if not predictions_raw:
        return _fallback_detection('no_predictions')

    # Normalize pipeline output to a flat list of dicts
    if isinstance(predictions_raw, list) and predictions_raw and isinstance(predictions_raw[0], list):
        predictions = predictions_raw[0]
    elif isinstance(predictions_raw, list):
        predictions = predictions_raw
    else:
        predictions = [predictions_raw]

    candidates: List[Dict[str, object]] = []
    best_code: Optional[str] = None
    best_confidence: float = 0.0

    for item in predictions:
        label_value = str(item.get('label', '')).lower()
        score_fraction = float(item.get('score', 0.0))
        score_percent = max(min(score_fraction * 100.0, 100.0), 0.0)
        mapped_code = AFROLID_LABEL_TO_CODE.get(label_value)

        candidate_payload: Dict[str, object] = {
            'label': label_value,
            'score': round(score_percent, 2)
        }

        if mapped_code:
            candidate_payload['code'] = mapped_code
            candidate_payload['language'] = _get_language_name(mapped_code)

            if score_percent > best_confidence:
                best_confidence = score_percent
                best_code = mapped_code

        candidates.append(candidate_payload)

    if best_code is None:
        return _fallback_detection('no_supported_language', candidates)

    greeting = random.choice(_get_greetings(best_code))
    return {
        'language': _get_language_name(best_code),
        'code': best_code,
        'confidence': round(min(best_confidence, 99.0), 2),
        'greeting': greeting,
        'source': 'afrolid',
        'model': AFROLID_MODEL_ID,
        'candidates': candidates
    }

def generate_silent_audio():
    """Generate 1 second of silent audio as fallback"""
    sample_rate = 16000
    duration = 1
    num_samples = sample_rate * duration
    
    audio_buffer = io.BytesIO()
    with wave.open(audio_buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        silent_audio = b'\x00\x00' * num_samples
        wav_file.writeframes(silent_audio)
    
    audio_buffer.seek(0)
    return audio_buffer.read()

def generate_tts_mms(text, lang_code='eng'):
    """Generate TTS using Meta's MMS models (local inference)"""
    if not MMS_AVAILABLE:
        return None
    
    try:
        print(f"[MMS] Generating speech with MMS for language: {lang_code}")
        
        # Check cache
        model_name = f"facebook/mms-tts-{lang_code}"
        if model_name not in mms_models:
            print(f"[LOAD] Loading model: {model_name} (first time, may take 30-60s)...")
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = VitsModel.from_pretrained(model_name)
            mms_models[model_name] = (tokenizer, model)
            print(f"[OK] Model cached")
        else:
            tokenizer, model = mms_models[model_name]
            print(f"[OK] Using cached model")
        
        # Generate speech
        inputs = tokenizer(text, return_tensors="pt")
        
        with torch.no_grad():
            output = model(**inputs).waveform
        
        # Convert to audio bytes (WAV format)
        audio_np = output.squeeze().cpu().numpy()
        
        # Create WAV file in memory
        audio_buffer = io.BytesIO()
        scipy.io.wavfile.write(audio_buffer, rate=model.config.sampling_rate, data=audio_np)
        audio_buffer.seek(0)
        audio_data = audio_buffer.read()
        
        print(f"[OK] Generated {len(audio_data)} bytes of {lang_code} speech")
        return audio_data
            
    except Exception as e:
        print(f"[ERROR] MMS error: {e}")
        import traceback
        traceback.print_exc()
        return None

def generate_tts_gtts(text, lang_code='en'):
    """Generate TTS using Google Text-to-Speech (gTTS)"""
    try:
        print(f"[MMS] Generating speech with gTTS for language: {lang_code}")
        
        # Create gTTS object
        tts = gTTS(text=text, lang=lang_code, slow=False)
        
        # Save to BytesIO buffer
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        audio_data = audio_buffer.read()
        
        print(f"[OK] Generated {len(audio_data)} bytes of {lang_code} speech")
        return audio_data
            
    except Exception as e:
        print(f"[ERROR] gTTS error: {e}")
        return None

@app.route('/tts-stream', methods=['POST'])
def text_to_speech_stream():
    try:
        data = request.json
        text = data.get('text', '')
        lang_code = data.get('lang_code', 'en')  # Get language code from request
        
        if not text:
            return jsonify({'error': 'Text is required'}), 400
        
        print(f"\n[TEXT] Text: {text[:50]}...")
        print(f"[LANG] Language: {lang_code}")
        
        # Get MMS language code
        mms_lang = SA_LANGUAGE_CODES.get(lang_code, 'eng')
        print(f"[LANG] MMS language code: {mms_lang}")
        
        audio_data = None
        mime_type = 'audio/wav'
        
        # Try MMS for non-English/Afrikaans languages
        if MMS_AVAILABLE and lang_code not in GTTS_SUPPORTED:
            print(f"[USE] Using MMS for {lang_code}")
            audio_data = generate_tts_mms(text, mms_lang)
            mime_type = 'audio/wav'
        
        # Fallback to gTTS for English/Afrikaans or if MMS failed
        if audio_data is None and lang_code in GTTS_SUPPORTED:
            print(f"[USE] Using gTTS for {lang_code}")
            gtts_code = 'en' if lang_code == 'en' else 'af'
            audio_data = generate_tts_gtts(text, gtts_code)
            mime_type = 'audio/mpeg'
        
        # Final fallback to silent audio
        if audio_data is None:
            print(f"[WARN] Falling back to silent audio")
            audio_data = generate_silent_audio()
            mime_type = 'audio/wav'
        
        print(f"[OK] Returning {len(audio_data)} bytes of audio ({mime_type})")
        return Response(
            audio_data,
            mimetype=mime_type,
            headers={
                'Content-Type': mime_type,
                'Content-Length': str(len(audio_data))
            }
        )
        
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"[SERVER] Server: http://localhost:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=False)

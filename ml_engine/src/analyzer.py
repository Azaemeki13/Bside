import os
import hashlib
import json
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import librosa
import numpy as np
import essentia.standard as es
from minio import Minio
import requests

minio_client = Minio(
    "minio:9000",
    access_key=os.environ.get("AWS_ACCESS_KEY_ID"),
    secret_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    secure=False
)
app = FastAPI(title="B-SIDE Audio Analyzer ML Service")
compute_executor = ThreadPoolExecutor(max_workers=os.cpu_count() or 2)

# Pretrained Essentia MusiCNN models (MSD-trained), downloaded at image build
# time into /models (kept outside /app so the dev bind mount over /app in
# docker-compose.yml doesn't shadow them). See https://essentia.upf.edu/models.html
MODELS_DIR = os.environ.get("ML_MODELS_DIR", "/models")
ESSENTIA_SAMPLE_RATE = 16000

# Single-shot binary classifiers: model file -> index of the "positive" class
# in that model's own class list (order isn't consistent across models).
DANCEABILITY_MODEL = ("danceability-musicnn-msd-2.pb", 0)  # ["danceable", "not_danceable"]
ACOUSTICNESS_MODEL = ("mood_acoustic-musicnn-msd-2.pb", 0)  # ["acoustic", "non_acoustic"]
MOOD_CLASSIFIERS = {
    "happy": ("mood_happy-musicnn-msd-2.pb", 0),          # ["happy", "non_happy"]
    "sad": ("mood_sad-musicnn-msd-2.pb", 1),               # ["non_sad", "sad"]
    "relaxed": ("mood_relaxed-musicnn-msd-2.pb", 1),       # ["non_relaxed", "relaxed"]
    "aggressive": ("mood_aggressive-musicnn-msd-2.pb", 0), # ["aggressive", "not_aggressive"]
    "electronic": ("mood_electronic-musicnn-msd-2.pb", 0), # ["electronic", "non_electronic"]
    "party": ("mood_party-musicnn-msd-2.pb", 1),           # ["non_party", "party"]
}
EMBEDDING_MODEL_FILE = "msd-musicnn-1.pb"
VALENCE_AROUSAL_MODEL_FILE = "deam-msd-musicnn-2.pb"

_classifier_cache: dict[str, es.TensorflowPredictMusiCNN] = {}


def _model_path(filename: str) -> str:
    return os.path.join(MODELS_DIR, filename)


def _get_classifier(filename: str) -> es.TensorflowPredictMusiCNN:
    if filename not in _classifier_cache:
        _classifier_cache[filename] = es.TensorflowPredictMusiCNN(
            graphFilename=_model_path(filename),
            input="model/Placeholder",
            output="model/Sigmoid",
        )
    return _classifier_cache[filename]


# Embedding extractor + regression head for valence/arousal (DEAM dataset).
_embedding_model = es.TensorflowPredictMusiCNN(
    graphFilename=_model_path(EMBEDDING_MODEL_FILE),
    input="model/Placeholder",
    output="model/dense/BiasAdd",
)
_valence_arousal_model = es.TensorflowPredict2D(
    graphFilename=_model_path(VALENCE_AROUSAL_MODEL_FILE),
    input="model/Placeholder",
    output="model/Identity",
)


class AnalysisRequest(BaseModel):
    track_id: str
    object_key: str


def _classify(audio_arr: np.ndarray, filename: str, positive_index: int) -> float:
    predictions = _get_classifier(filename)(audio_arr)
    return float(np.mean(predictions[:, positive_index]))


def signal_key(audio_arr: np.ndarray) -> str:
    """Stable content hash of the decoded 16 kHz mono signal.

    Independent of the container/codec the audio was delivered in, so a track
    analyzed offline by ``batch_analyze.py`` and the same track later uploaded
    through the real pipeline resolve to the same key.
    """
    return hashlib.sha256(
        np.ascontiguousarray(audio_arr, dtype=np.float32).tobytes()
    ).hexdigest()


def _cached_features(audio_arr: np.ndarray) -> dict | None:
    """Return a precomputed analysis for this signal when ``ML_RESULT_CACHE_DIR``
    is set and holds a matching ``<signal_key>.json`` (written by
    ``batch_analyze.py``). Lets a demo replay the full upload -> verify ->
    /analyze -> callback pipeline with no model inference. No-op when unset."""
    cache_dir = os.environ.get("ML_RESULT_CACHE_DIR")
    if not cache_dir:
        return None
    cache_file = os.path.join(cache_dir, f"{signal_key(audio_arr)}.json")
    if not os.path.isfile(cache_file):
        return None
    with open(cache_file, "r", encoding="utf-8") as handle:
        cached = json.load(handle)
    print(f"ML cache hit -> {cache_file}")
    return {
        "dsp_analysis": cached["dsp_analysis"],
        "ml_features": cached["ml_features"],
        "normalized_vector": cached["normalized_vector"],
    }


def compute_audio_features(file_path: str, audio_arr=None, sr=None) -> dict:
    try:
        if audio_arr is None:
            audio_arr, sr = librosa.load(file_path, sr=ESSENTIA_SAMPLE_RATE, mono=True)
        audio_arr = audio_arr.astype(np.float32)
        if sr is None:
            sr = ESSENTIA_SAMPLE_RATE

        cached = _cached_features(audio_arr)
        if cached is not None:
            return cached

        tempo, _ = librosa.beat.beat_track(y=audio_arr, sr=sr)
        bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        chroma = librosa.feature.chroma_stft(y=audio_arr, sr=sr)
        mean_chroma = np.mean(chroma, axis=1)
        keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        harmonic_key = keys[np.argmax(mean_chroma)]

        danceability_file, danceability_index = DANCEABILITY_MODEL
        danceability = _classify(audio_arr, danceability_file, danceability_index)

        acoustic_file, acoustic_index = ACOUSTICNESS_MODEL
        accousticness = _classify(audio_arr, acoustic_file, acoustic_index)

        mood_scores = {
            mood: _classify(audio_arr, filename, index)
            for mood, (filename, index) in MOOD_CLASSIFIERS.items()
        }
        detected_mood, mood_probability = max(mood_scores.items(), key=lambda item: item[1])

        embeddings = _embedding_model(audio_arr)
        valence_arousal = _valence_arousal_model(embeddings)
        valence_raw, arousal_raw = np.mean(valence_arousal, axis=0)
        # DEAM annotations are on a 1-9 scale; normalize to 0-1.
        valence = float(np.clip((valence_raw - 1.0) / 8.0, 0.0, 1.0))
        energy = float(np.clip((arousal_raw - 1.0) / 8.0, 0.0, 1.0))

        normalized_bpm = (bpm - 60) / (180 - 60)
        normalized_bpm = float(np.clip(normalized_bpm, 0.0, 1.0))
        features_vector = [
            normalized_bpm,
            danceability,
            energy,
            accousticness,
            valence,
            mood_probability
        ]
        return {
            "dsp_analysis": {
                "tempo_bpm": round(bpm, 2),
                "harmonic_key": harmonic_key
            },
            "ml_features": {
                "danceability": round(danceability, 3),
                "energy": round(energy, 3),
                "accousticness": round(accousticness, 3),
                "valence": round(valence, 3),
                "mood": detected_mood,
                "mood_probability": round(mood_probability, 3)
            },
            "normalized_vector": features_vector
        }
    except Exception as e:
        print(f"File analysis error: {file_path}: {e}")
        raise e

async def async_download_and_analyze(track_id: str, object_key: str):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_path = temp_file.name
        try:
            minio_client.fget_object("bside-tracks", object_key, temp_path)
            loop = asyncio.get_running_loop()
            results = await loop.run_in_executor(
                compute_executor,
                compute_audio_features,
                temp_path
            )
            payload = {
                "track_id": track_id,
                **results
            }
            print(f"Finished analysis for {track_id}. Sending payload to Axum...", payload)
            rust_callback_url = "http://bside_rust_backend:8080/internal/songs/features"
            headers = {"X-API-Key": os.environ.get("PUBLIC_API_KEY", "")}
            max_attempts = 5
            for attempt in range(1, max_attempts + 1):
                response = requests.post(
                    rust_callback_url, json=payload, headers=headers, timeout=10
                )
                if response.status_code == 200:
                    print(f"Succes ! Song {track_id} was updated in Postgres via Axum.")
                    break
                # 429 (rate limit) and 5xx are transient - back off and retry so a
                # burst of analyses (e.g. a batch re-index) doesn't drop results.
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < max_attempts:
                        backoff = min(2 ** (attempt - 1), 8)
                        print(
                            f"Callback for {track_id} got {response.status_code}; "
                            f"retry {attempt}/{max_attempts - 1} in {backoff}s"
                        )
                        await asyncio.sleep(backoff)
                        continue
                print(
                    f"Callback rejected by Axum with the following code  "
                    f"{response.status_code}: {response.text}"
                )
                break

        except Exception as e:
            print(f"Song background task failure {track_id}: {e}")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

@app.post("/analyze", status_code=202)
async def analyze_track(request: AnalysisRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        async_download_and_analyze,
        request.track_id,
        request.object_key
    )
    return {"message": "Analysis job submitted successfully", "track_id": request.track_id}

import os
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


def compute_audio_features(file_path: str) -> dict:
    try:
        audio_arr, sr = librosa.load(file_path, sr=ESSENTIA_SAMPLE_RATE, mono=True)
        audio_arr = audio_arr.astype(np.float32)

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
            response = requests.post(
                rust_callback_url,
                json=payload,
                headers={"X-API-Key": os.environ.get("PUBLIC_API_KEY", "")},
                timeout=10,
            )
            if response.status_code == 200:
                print(f"Succes ! Song {track_id} was updated in Postgres via Axum.")
            else:
                print(f"Callback rejected by Axum with the following code  {response.status_code}: {response.text}")

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

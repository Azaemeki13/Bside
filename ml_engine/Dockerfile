FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libeigen3-dev \
    libyaml-dev \
    libfftw3-dev \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswresample-dev \
    libsamplerate0-dev \
    libtag1-dev \
    libchromaprint-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Make the pip-installed CUDA runtime libraries visible to TensorFlow's
# dlopen calls. No-op / silently unused on machines without a GPU passed
# through (docker-compose.gpu.yml) or without an NVIDIA driver present.
ENV LD_LIBRARY_PATH="/usr/local/lib/python3.11/site-packages/nvidia/cuda_runtime/lib:/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.11/site-packages/nvidia/cufft/lib:/usr/local/lib/python3.11/site-packages/nvidia/curand/lib:/usr/local/lib/python3.11/site-packages/nvidia/cusolver/lib:/usr/local/lib/python3.11/site-packages/nvidia/cusparse/lib:${LD_LIBRARY_PATH}"

# Pretrained Essentia MusiCNN classifiers (MSD-trained) and the DEAM
# valence/arousal regression head + its embedding extractor.
# https://essentia.upf.edu/models.html
ADD https://essentia.upf.edu/models/classifiers/danceability/danceability-musicnn-msd-2.pb /models/danceability-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_happy/mood_happy-musicnn-msd-2.pb /models/mood_happy-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_sad/mood_sad-musicnn-msd-2.pb /models/mood_sad-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_relaxed/mood_relaxed-musicnn-msd-2.pb /models/mood_relaxed-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_aggressive/mood_aggressive-musicnn-msd-2.pb /models/mood_aggressive-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_acoustic/mood_acoustic-musicnn-msd-2.pb /models/mood_acoustic-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_electronic/mood_electronic-musicnn-msd-2.pb /models/mood_electronic-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/classifiers/mood_party/mood_party-musicnn-msd-2.pb /models/mood_party-musicnn-msd-2.pb
ADD https://essentia.upf.edu/models/feature-extractors/musicnn/msd-musicnn-1.pb /models/msd-musicnn-1.pb
ADD https://essentia.upf.edu/models/classification-heads/deam/deam-msd-musicnn-2.pb /models/deam-msd-musicnn-2.pb

COPY . .
EXPOSE 8000
CMD ["uvicorn", "src.analyzer:app", "--host", "0.0.0.0", "--port", "8000"]
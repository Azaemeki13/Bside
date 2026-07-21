To install essentia, need a sandbox:
- python -m venv ~/pyvenv
- source pyvenv/bin/activate
- pip install essentia
- pip install numpy pyyaml six

when done type deactivate

To compile Essentia, y'all also need dependencies : 
- sudo apt-get install build-essential libeigen3-dev libyaml-dev libfftw3-dev libavcodec-dev libavformat-dev libavutil-dev libswresample-dev libsamplerate0-dev libtag1-dev libchromaprint-dev

if you're on arch f off here is the install : 
- yay -S --needed base-devel eigen libyaml fftw ffmpeg libsamplerate taglib chromaprint

if you don't have yay end yourself :---)
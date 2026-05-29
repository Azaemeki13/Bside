# Test Song Uploads

Each folder in this directory is treated as one album by `scripts/upload-test-library.py`.

Example:

```text
songs/
  Example Album/
    cover.png
    tag.txt
    01 - First Track.wav
    02 - Second Track.flac
```

Supported audio files: `.wav`, `.flac`.
Supported cover files: `cover.png`, `cover.jpg`, `cover.jpeg`, `cover.webp`.
Use `tag.txt` or `genre.txt` for the album tag/genre.

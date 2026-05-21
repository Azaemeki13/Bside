May 21, 2026

# B-Side Upload And Playback Changes

## What Changed

The backend and frontend now have a working local test path for uploading an audio file to MinIO and playing it with Howler.

Backend changes:

- Registration now commits its database transaction, so users created through `/register` can log in afterward.
- Artist creation now reads the authenticated user from JWT claims instead of expecting an unset request extension.
- Album creation now reads the authenticated user from JWT claims instead of expecting an unset request extension.
- Song creation ownership now checks `albums -> artists -> user_id` instead of comparing an album artist id directly to a user id.
- Song verification now uses the same corrected ownership check.
- A new protected playback endpoint was added:

```text
GET /songs/{song_id}/stream-url
```

This endpoint returns a short-lived MinIO presigned `GET` URL for a verified song.

Frontend changes:

- The test player in `progression-bar.ts` now requests a signed stream URL from the backend and passes that URL to `AudioPlayerService`.
- The old local `assets/test.mp3` code is still present as an `old version` comment.
- The player now reads the JWT from `localStorage.auth_token`.
- The player template now shows audio/request errors instead of failing silently.
- Google OAuth now redirects through `/login?token=...`, so `login.ts` can store `auth_token` before sending the user into `/bside_app`.

## Required Services

Start the infrastructure:

```bash
docker compose -p bside up -d
```

Run migrations if needed:

```bash
sqlx migrate run --source ./back/migrations
```

Run the backend from the repository root:

```bash
cargo run --manifest-path back/Cargo.toml
```

Run the frontend:

```bash
cd front
npm start
```

## Upload A Song From Start To Finish

You need a JWT token. In the app, Google OAuth should store it as:

```js
localStorage.getItem('auth_token')
```

For curl workflows, copy that token:

```bash
TOKEN='paste_auth_token_here'
```

Create an artist profile:

```bash
curl -X POST http://localhost:8080/artists \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=Curl Test Artist" \
  -F "bio=Artist used for local upload tests"
```

Create an album:

```bash
curl -X POST http://localhost:8080/albums \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Curl Test Album" \
  -F "genre=Test"
```

Copy the returned album id:

```bash
ALBUM_ID='paste_album_id_here'
```

Create the song metadata and request a MinIO upload URL:

```bash
curl -s -X POST http://localhost:8080/songs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Test WAV Upload\",
    \"album_id\": \"$ALBUM_ID\",
    \"duration_seconds\": 30,
    \"format\": \"wav\",
    \"ml_features\": null
  }"
```

Copy these fields from the response:

```bash
SONG_ID='paste_song_id_here'
UPLOAD_URL='paste_full_upload_url_here'
```

Upload the file to MinIO. The upload URL expires after 5 minutes, so run this soon after creating the song:

```bash
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: audio/wav" \
  --data-binary @test_file.wav
```

Verify the song through the backend:

```bash
curl -X PUT "http://localhost:8080/songs/$SONG_ID/verify" \
  -H "Authorization: Bearer $TOKEN"
```

Expected response:

```json
{"status":"verified"}
```

At that point:

- The file exists in MinIO.
- The database song row is marked `Ready`.
- The song can be used for playback through `/stream-url`.

## Play A Song With Howler

Request a fresh stream URL:

```bash
curl "http://localhost:8080/songs/$SONG_ID/stream-url" \
  -H "Authorization: Bearer $TOKEN"
```

Response shape:

```json
{
  "expires_in": 300,
  "url": "http://localhost:9000/bside-tracks/..."
}
```

Use the returned `url` with Howler:

```ts
this.audio.load({
  id: songId,
  title: 'Test WAV Upload',
  artist: 'Curl Test Artist',
  src: data.url,
  format: 'wav',
});

this.audio.play();
```

Current test setup:

- `progression-bar.ts` is hardcoded to request a stream URL for the uploaded test song:

```text
ea04d576-61ce-4961-9269-efe3ba01e45e
```

- It reads the JWT from:

```ts
localStorage.getItem('auth_token')
```

- It then calls:

```text
GET http://localhost:8080/songs/{song_id}/stream-url
```

- The returned MinIO URL is passed into `AudioPlayerService`, which creates a Howler `Howl` with `html5: true`.

## Remove A Song, Artist, Or Album

### Remove A Song

There is a route:

```text
DELETE /songs/{id}
```

Example:

```bash
curl -X DELETE "http://localhost:8080/songs/$SONG_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Current caveat: the handler still compares `albums.artist_id` directly to `claims.sub`. Since `claims.sub` is a user id and `albums.artist_id` is an artist id, this can reject valid users. This route needs the same `albums -> artists -> user_id` ownership fix used by song creation and verification.

When it works, it marks the song as:

```text
Deleted
```

Then the background cleanup task eventually removes deleted song objects from MinIO and deletes their database rows.

### Remove An Album

There is a route:

```text
DELETE /albums/{album_id}
```

Example:

```bash
curl -X DELETE "http://localhost:8080/albums/$ALBUM_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Current caveat: the handler still expects `Extension<Uuid>`, but the auth middleware does not insert that extension. In the current state this route is not reliably usable through the API. It should be changed to use `Claims`, like `create_album_handler`.

When it works, it marks the album and all its songs as:

```text
Deleted
```

Then the background cleanup task removes the album after its songs are gone.

### Remove An Artist

There is currently no route for deleting artists.

Missing route:

```text
DELETE /artists/{artist_id}
```

Before implementing artist deletion, decide whether deleting an artist should:

- Soft-delete the artist only.
- Soft-delete all albums and songs by that artist.
- Hard-delete everything through database cascade rules.

The safest project-consistent behavior would be soft deletion first, then background cleanup after songs and albums are removed.

## Listing Artists And Songs

There is currently no complete list endpoint for artists or songs.

Available options:

- Search ready songs, artists, albums, and public playlists:

```bash
curl "http://localhost:8080/search?q=Test"
```

- View implemented routes:

```text
http://localhost:8080/swagger-ui
```

Recommended future endpoints:

```text
GET /artists
GET /songs
GET /albums
```


//! Album catalog: an artist's own album management plus public album reads.

use super::util::{is_admin, public_storage_url, required_text, validate_genre};
use crate::{
    AlbumDetailedResponse, AlbumListItem, AlbumResponse, AlbumSongItem, AnyAuth, AppState,
    BSideError, Claims,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/albums",
    request_body(content = String, description = "Multipart form data with title, genre, and cover image"),
    responses(
        (status = 200, description = "Album created successfully", body = AlbumResponse),
        (status = 400, description = "Invalid form data or missing required fields"),
        (status = 401, description = "Unauthorized or not an artist"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn create_album_handler(
    State(state): State<AppState>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<AlbumResponse>, BSideError> {
    let current_user_id = claims.sub;
    let artist_record = sqlx::query!("SELECT id FROM artists WHERE user_id = $1", current_user_id)
        .fetch_optional(&state.db)
        .await?;
    let artist_id = match artist_record {
        Some(record) => record.id,
        None => {
            return Err(BSideError::UnauthorizedProfile);
        }
    };
    let mut title: Option<String> = None;
    let mut genre: Option<String> = None;
    let mut cover_url = public_storage_url("bside-covers", "default_cover.jpg");
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| BSideError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "title" => {
                title = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| BSideError::BadRequest(e.to_string()))?,
                );
            }
            "genre" => {
                genre = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| BSideError::BadRequest(e.to_string()))?,
                );
            }
            "cover" => {
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| BSideError::BadRequest(e.to_string()))?;
                if data.len() < 4 {
                    return Err(BSideError::BadRequest(
                        "File too small to be valid !".into(),
                    ));
                }

                let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                let (extension, stored_content_type) = if data.starts_with(&png_header) {
                    ("png", "image/png")
                } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
                    ("jpg", "image/jpeg")
                } else if data.starts_with(b"RIFF") && data.len() >= 12 && &data[8..12] == b"WEBP" {
                    ("webp", "image/webp")
                } else {
                    return Err(BSideError::BadRequest(
                        "Cover must be a PNG, JPEG, or WebP image.".into(),
                    ));
                };

                let max_size = 10 * 1024 * 1024;
                if data.len() > max_size {
                    return Err(BSideError::BadRequest(
                        "File size exceeds 10MB limit!".into(),
                    ));
                }
                if !data.is_empty() {
                    let file_id = Uuid::new_v4();
                    let key = format!("{file_id}.{extension}");
                    state
                        .aws_client
                        .put_object()
                        .bucket("bside-covers")
                        .key(&key)
                        .body(data.into())
                        .content_type(stored_content_type)
                        .send()
                        .await
                        .map_err(|e| BSideError::S3Error(e.to_string()))?;
                    cover_url = public_storage_url("bside-covers", &key);
                }
            }
            _ => {}
        }
    }
    let title = required_text(
        &title.ok_or_else(|| BSideError::BadRequest("Missing title".into()))?,
        "Album title",
        120,
    )?;
    let genre =
        validate_genre(&genre.ok_or_else(|| BSideError::BadRequest("Missing genre".into()))?)?;
    let album_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO albums (id, artist_id, title, genre, cover_url, status)
        VALUES ($1, $2, $3, $4, $5, 'Pending')",
        album_id,
        artist_id,
        title,
        genre,
        cover_url,
    )
    .execute(&state.db)
    .await?;
    Ok(Json(AlbumResponse {
        id: album_id,
        artist_id,
        title,
        genre,
        cover_url,
        status: "Pending".to_string(),
    }))
}

#[utoipa::path(
    get,
    path = "/albums",
    responses(
        (status = 200, description = "Current artist albums", body = Vec<AlbumListItem>),
        (status = 401, description = "Unauthorized or not an artist"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn get_my_albums_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<AlbumListItem>>, BSideError> {
    let albums = sqlx::query_as!(
        AlbumListItem,
        r#"
        SELECT
            a.id,
            a.artist_id,
            ar.name AS "artist_name!",
            a.title,
            a.genre,
            a.cover_url,
            a.status,
            COUNT(s.id) AS "song_count!",
            a.created_at AS "created_at!"
        FROM albums a
        JOIN artists ar ON ar.id = a.artist_id
        LEFT JOIN songs s ON s.album_id = a.id AND s.status != 'Deleted'
        WHERE ar.user_id = $1 AND a.status != 'Deleted'
        GROUP BY a.id, ar.name
        ORDER BY a.created_at DESC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(albums))
}

#[utoipa::path(
    get,
    path = "/catalog/albums/{album_id}",
    params(("album_id" = uuid::Uuid, Path, description = "Album ID")),
    responses(
        (status = 200, description = "Public album details with ready songs", body = AlbumDetailedResponse),
        (status = 404, description = "Album not found"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Catalog"]
)]
pub async fn get_album_by_id_handler(
    State(state): State<AppState>,
    Path(album_id): Path<uuid::Uuid>,
    _auth: AnyAuth,
) -> Result<Json<AlbumDetailedResponse>, BSideError> {
    let album = sqlx::query!(
        r#"
        SELECT
            a.id,
            a.artist_id,
            ar.name AS "artist_name!",
            a.title,
            a.genre,
            a.cover_url,
            a.status,
            a.created_at AS "created_at!",
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', s.id,
                        'title', s.title,
                        'duration_seconds', s.duration_seconds,
                        'status', s.status,
                        'audio_url', s.audio_url,
                        'created_at', s.created_at
                    )
                    ORDER BY s.created_at ASC
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'::jsonb
            ) AS "songs!: sqlx::types::Json<Vec<AlbumSongItem>>"
        FROM albums a
        JOIN artists ar ON ar.id = a.artist_id
        LEFT JOIN songs s ON s.album_id = a.id AND s.status = 'Ready'
        WHERE a.id = $1 AND a.status = 'Ready'
        GROUP BY a.id, ar.name
        "#,
        album_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(Json(AlbumDetailedResponse {
        id: album.id,
        artist_id: album.artist_id,
        artist_name: album.artist_name,
        title: album.title,
        genre: album.genre,
        cover_url: album.cover_url,
        status: album.status,
        created_at: album.created_at,
        songs: album.songs.0,
    }))
}

#[utoipa::path(
    delete,
    path = "/albums/{album_id}",
    params(("album_id" = uuid::Uuid, Path, description = "Album ID")),
    responses(
        (status = 200, description = "Album queued for deletion", body = serde_json::Value),
        (status = 401, description = "Unauthorized - not album owner"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn delete_album_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(album_id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, BSideError> {
    let album = sqlx::query!(
        r#"
        SELECT a.cover_url, ar.user_id
        FROM albums a
        JOIN artists ar ON a.artist_id = ar.id
        WHERE a.id = $1
        "#,
        album_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;
    let caller_is_admin = is_admin(&state, claims.sub).await?;
    if album.user_id != Some(claims.sub) && !caller_is_admin {
        return Err(BSideError::UnauthorizedProfile);
    }
    let songs = sqlx::query!("SELECT audio_url FROM songs WHERE album_id = $1", album_id)
        .fetch_all(&state.db)
        .await?;
    for song in songs {
        if let Some(key) = song.audio_url.split('/').last() {
            let _ = state
                .aws_client
                .delete_object()
                .bucket("bside-tracks")
                .key(key)
                .send()
                .await;
        }
    }
    if !album.cover_url.contains("default_") {
        if let Some(key) = album.cover_url.split('/').last() {
            let _ = state
                .aws_client
                .delete_object()
                .bucket("bside-covers")
                .key(key)
                .send()
                .await;
        }
    }
    sqlx::query!("DELETE FROM albums WHERE id = $1", album_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

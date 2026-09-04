//! Playlist CRUD and song membership. The "Liked Songs" special-case
//! playlist lives in [`super::likes`]; raw play/skip/complete logging lives
//! in [`super::interactions`].

use super::util::{optional_text, required_text};
use crate::{
    AddSongResponse, AppState, BSideError, Claims, Playlist, PlaylistDetailedResponse,
    PlaylistPayload, PlaylistSongItem, UpdateStructurePayload,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
};
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/playlists",
    request_body = PlaylistPayload,
    responses(
        (status = 200, description = "Playlist created successfully", body = Playlist),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Playlists"]
)]
pub async fn create_playlist_handler(
    State(state): State<AppState>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<Playlist>, BSideError> {
    let mut title: Option<String> = None;
    let mut description: Option<String> = None;
    let mut cover_url: Option<String> = None;

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
            "description" => {
                description = Some(
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
                    continue;
                }
                let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                let (extension, content_type) = if data.starts_with(&png_header) {
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
                if data.len() > 10 * 1024 * 1024 {
                    return Err(BSideError::BadRequest(
                        "File size exceeds 10MB limit!".into(),
                    ));
                }
                let key = format!("{}.{}", Uuid::new_v4(), extension);
                state
                    .aws_client
                    .put_object()
                    .bucket("bside-covers")
                    .key(&key)
                    .body(data.into())
                    .content_type(content_type)
                    .send()
                    .await
                    .map_err(|e| BSideError::S3Error(e.to_string()))?;
                cover_url = Some(super::util::public_storage_url("bside-covers", &key));
            }
            _ => {}
        }
    }

    let title = required_text(
        &title.ok_or_else(|| BSideError::BadRequest("Missing title".into()))?,
        "Playlist title",
        100,
    )?;
    let description = optional_text(description, "Playlist description", 1_000)?;

    let playlist = sqlx::query_as!(
        Playlist,
        r#"
        INSERT INTO playlists (title, description, owner_id, is_public, cover_url)
        VALUES ($1, $2, $3, true, $4)
        RETURNING
            id,
            title,
            owner_id,
            COALESCE(song_count, 0) as "song_count!",
            is_public as "is_public!",
            created_at as "created_at!",
            cover_url
        "#,
        title,
        description,
        claims.sub,
        cover_url,
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(playlist))
}

#[utoipa::path(
    post,
    path = "/playlists/{playlist_id}/songs/{song_id}",
    params(
        ("playlist_id" = uuid::Uuid, Path, description = "Playlist ID"),
        ("song_id" = uuid::Uuid, Path, description = "Song ID"),
    ),
    responses(
        (status = 201, description = "Song added to playlist successfully", body = AddSongResponse),
        (status = 400, description = "Song not ready or invalid state"),
        (status = 401, description = "Unauthorized - not playlist owner"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Playlists"]
)]
pub async fn add_song_to_playlist_handler(
    State(state): State<AppState>,
    axum::extract::Path((playlist_id, song_id)): axum::extract::Path<(uuid::Uuid, uuid::Uuid)>,
    claims: Claims,
) -> Result<(axum::http::StatusCode, axum::Json<AddSongResponse>), BSideError> {
    let mut tx = state.db.begin().await?;
    let is_owner = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM playlists WHERE id = $1 AND owner_id = $2)",
        playlist_id,
        claims.sub
    )
    .fetch_one(&mut *tx)
    .await?
    .unwrap_or(false);
    if !is_owner {
        return Err(BSideError::UnauthorizedProfile);
    }
    let song = sqlx::query!(
        r#"SELECT duration_seconds, status::text "status!", ml_features FROM songs WHERE id = $1
        "#,
        song_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if song.status != "Ready" {
        return Err(BSideError::SongNotReady);
    }
    let is_duplicate = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM playlist_songs WHERE playlist_id = $1
        AND song_id = $2)"#,
        playlist_id,
        song_id
    )
    .fetch_one(&mut *tx)
    .await?
    .unwrap_or(false);
    if is_duplicate {
        tx.commit().await?;
        return Ok((
            axum::http::StatusCode::OK,
            axum::Json(AddSongResponse {
                message: "Song is already in this playlist.".to_string(),
                warning: Some("Note: This song is already in this playlist.".to_string()),
            }),
        ));
    }
    let next_pos = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(position), 0)  + 1 FROM playlist_songs WHERE playlist_id = $1",
        playlist_id
    )
    .fetch_one(&mut *tx)
    .await?
    .unwrap_or(1);
    sqlx::query!(
        "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES ($1, $2, $3)",
        playlist_id,
        song_id,
        next_pos
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"
        UPDATE playlists
        SET
            total_duration = COALESCE(total_duration, 0) + $1,
            song_count = COALESCE(song_count, 0) + 1,
            ml_features = COALESCE(ml_features, '{}'::jsonb) || COALESCE($2, '{}'::jsonb)
        WHERE id = $3
        "#,
        song.duration_seconds,
        song.ml_features,
        playlist_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((
        axum::http::StatusCode::CREATED,
        axum::Json(AddSongResponse {
            message: "Song added to playlist successfully.".to_string(),
            warning: None,
        }),
    ))
}

#[utoipa::path(
    delete,
    path = "/playlists/{playlist_id}/songs/{song_id}",
    params(
        ("playlist_id" = uuid::Uuid, Path, description = "Playlist ID"),
        ("song_id" = uuid::Uuid, Path, description = "Song ID (link_id)"),
    ),
    responses(
        (status = 204, description = "Song removed from playlist successfully"),
        (status = 401, description = "Unauthorized - not playlist owner"),
        (status = 404, description = "Song or playlist not found"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Playlists"]
)]
pub async fn remove_song_from_pl(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path((playlist_id, link_id)): axum::extract::Path<(Uuid, Uuid)>,
) -> Result<axum::http::StatusCode, BSideError> {
    let mut tx = state.db.begin().await?;
    let info = sqlx::query!(
        r#"
        SELECT s.duration_seconds, p.owner_id
        FROM playlist_songs ps
        JOIN songs s ON s.id = ps.song_id
        JOIN playlists p ON p.id = ps.playlist_id
        WHERE ps.id = $1 AND ps.playlist_id = $2
        "#,
        link_id,
        playlist_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    let info = match info {
        Some(i) if i.owner_id == claims.sub => i,
        Some(_) => return Err(BSideError::UnauthorizedProfile),
        None => return Err(BSideError::NotFound),
    };
    let _delete = sqlx::query!("DELETE FROM playlist_songs WHERE id = $1", link_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!(
        "UPDATE playlists
            SET total_duration = total_duration - $1,
            song_count = song_count - 1
            WHERE id = $2",
        info.duration_seconds,
        playlist_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/playlists/{id}",
    params(("id" = uuid::Uuid, Path, description = "Playlist ID")),
    responses(
        (status = 200, description = "Playlist details with songs", body = PlaylistDetailedResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Playlist not found or not accessible"),
    ),
    security(("Bearer" = [])),
    tags = ["Playlists"]
)]
pub async fn get_playlist_by_id_handler(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    claims: Claims,
) -> Result<Json<PlaylistDetailedResponse>, BSideError> {
    let playlist = sqlx::query!(
        r#"
        SELECT
            p.id,
            p.title,
            p.description,
            p.owner_id,
            p.cover_url,
            u.username as owner_username,
            p.total_duration as "total_duration!",
            p.song_count as "song_count!",
            p.is_public as "is_public!",
            COALESCE(
                (SELECT json_agg(json_build_object(
                    'link_id', ps.id,
                    'song_id', s.id,
                    'title', s.title,
                    'duration_seconds', s.duration_seconds,
                    'position', ps.position,
                    'audio_url', s.audio_url,
                    'status', s.status,
                    'artist_id', ar.id,
                    'artist_name', ar.name,
                    'cover_url', a.cover_url
                ) ORDER BY ps.position)
                 FROM playlist_songs ps
                 JOIN songs s ON ps.song_id = s.id
                 JOIN albums a ON s.album_id = a.id
                 JOIN artists ar ON a.artist_id = ar.id
                 WHERE ps.playlist_id = p.id
                ), '[]'
            ) as "songs!: sqlx::types::Json<Vec<PlaylistSongItem>>"
        FROM playlists p
        JOIN users u ON p.owner_id = u.id
        WHERE p.id = $1
            AND (p.is_public = true OR p.owner_id = $2)
        "#,
        id,
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(Json(PlaylistDetailedResponse {
        id: playlist.id,
        title: playlist.title,
        description: playlist.description,
        owner_id: playlist.owner_id,
        owner_username: playlist.owner_username,
        total_duration: playlist.total_duration,
        song_count: playlist.song_count,
        is_public: playlist.is_public,
        cover_url: playlist.cover_url,
        songs: playlist.songs.0,
    }))
}

#[utoipa::path(
    put,
    path = "/playlists/{id}",
    params(("id" = uuid::Uuid, Path, description = "Playlist ID")),
    request_body = UpdateStructurePayload,
    responses(
        (status = 200, description = "Playlist updated successfully", body = serde_json::Value),
        (status = 401, description = "Unauthorized - not playlist owner"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Playlists"]
)]
pub async fn update_playlist_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    axum::extract::Json(payload): axum::extract::Json<UpdateStructurePayload>,
) -> Result<axum::Json<serde_json::Value>, BSideError> {
    let title = payload
        .title
        .map(|value| required_text(&value, "Playlist title", 100))
        .transpose()?;
    let description_was_supplied = payload.description.is_some();
    let description = optional_text(payload.description, "Playlist description", 1_000)?;
    let res = sqlx::query(
        "UPDATE playlists
        SET
            title = COALESCE($1, title),
            description = CASE WHEN $2 THEN $3 ELSE description END,
            is_public = COALESCE($4, is_public)
        WHERE id = $5 and owner_id = $6",
    )
    .bind(title)
    .bind(description_was_supplied)
    .bind(description)
    .bind(payload.is_public)
    .bind(id)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(BSideError::UnauthorizedProfile);
    }
    Ok(axum::Json(serde_json::json!({ "status": "updated"})))
}

#[utoipa::path(
    delete,
    path = "/playlists/{id}",
    params(("id" = uuid::Uuid, Path, description = "Playlist ID")),
    responses(
        (status = 204, description = "Playlist deleted successfully"),
        (status = 401, description = "Unauthorized - not playlist owner"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Playlists"]
)]
pub async fn delete_playlist_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<axum::http::StatusCode, BSideError> {
    let res = sqlx::query!(
        "DELETE FROM playlists WHERE id = $1 AND owner_id = $2",
        id,
        claims.sub
    )
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(BSideError::UnauthorizedProfile);
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/playlists",
    responses(
        (status = 200, description = "List of user's playlists", body = Vec<Playlist>),
        (status = 401, description = "Unauthorized"),
    ),
    tags = ["Playlists"]
)]
pub async fn get_my_playlists_handler(
    claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<Playlist>>, BSideError> {
    let playlists = sqlx::query_as!(
        Playlist,
        r#"
        SELECT
            id,
            title,
            owner_id,
            COALESCE(song_count, 0) as "song_count!",
            is_public as "is_public!",
            created_at as "created_at!",
            cover_url
        FROM playlists
        WHERE owner_id = $1 AND title != 'Liked Songs'
        ORDER BY created_at DESC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(playlists))
}

//! The "Liked Songs" playlist: an implicit, auto-created playlist per user
//! that the like/unlike endpoints append to and remove from.

use crate::preferences::refresh_user_preference;
use crate::{AddSongResponse, AppState, BSideError, Claims, Playlist, PlaylistDetailedResponse, PlaylistSongItem};
use axum::{Json, extract::State};
use uuid::Uuid;

async fn get_or_create_liked_playlist(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
) -> Result<Playlist, BSideError> {
    let playlist = sqlx::query_as!(
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
        WHERE owner_id = $1 AND title = 'Liked Songs'
        ORDER BY created_at ASC
        LIMIT 1
        "#,
        user_id
    )
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(playlist) = playlist {
        return Ok(playlist);
    }

    let playlist = sqlx::query_as!(
        Playlist,
        r#"
        INSERT INTO playlists (title, description, owner_id, is_public)
        VALUES ('Liked Songs', 'Songs you liked', $1, false)
        RETURNING
            id,
            title,
            owner_id,
            COALESCE(song_count, 0) as "song_count!",
            is_public as "is_public!",
            created_at as "created_at!",
            cover_url
        "#,
        user_id
    )
    .fetch_one(&mut **tx)
    .await?;

    Ok(playlist)
}

async fn get_liked_playlist_details(
    state: &AppState,
    user_id: Uuid,
) -> Result<PlaylistDetailedResponse, BSideError> {
    let mut tx = state.db.begin().await?;
    let liked_playlist = get_or_create_liked_playlist(&mut tx, user_id).await?;
    tx.commit().await?;

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
        WHERE p.id = $1 AND p.owner_id = $2
        "#,
        liked_playlist.id,
        user_id
    )
    .fetch_one(&state.db)
    .await?;

    Ok(PlaylistDetailedResponse {
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
    })
}

#[utoipa::path(
    get,
    path = "/liked-songs",
    responses(
        (status = 200, description = "User's liked songs playlist", body = PlaylistDetailedResponse),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Likes"]
)]
pub async fn get_liked_songs_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<PlaylistDetailedResponse>, BSideError> {
    Ok(Json(get_liked_playlist_details(&state, claims.sub).await?))
}

#[utoipa::path(
    post,
    path = "/songs/{song_id}/like",
    params(("song_id" = uuid::Uuid, Path, description = "Song ID")),
    responses(
        (status = 201, description = "Song liked successfully", body = AddSongResponse),
        (status = 200, description = "Song was already liked", body = AddSongResponse),
        (status = 400, description = "Song not ready"),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Likes"]
)]
pub async fn like_song_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(song_id): axum::extract::Path<Uuid>,
) -> Result<(axum::http::StatusCode, axum::Json<AddSongResponse>), BSideError> {
    let mut tx = state.db.begin().await?;
    let liked_playlist = get_or_create_liked_playlist(&mut tx, claims.sub).await?;
    let song = sqlx::query!(
        r#"SELECT duration_seconds, status::text "status!", ml_features FROM songs WHERE id = $1"#,
        song_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if song.status != "Ready" {
        return Err(BSideError::SongNotReady);
    }
    let is_duplicate = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2)"#,
        liked_playlist.id,
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
                message: "Song is already liked.".to_string(),
                warning: Some("Note: This song is already liked.".to_string()),
            }),
        ));
    }
    let next_pos = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_songs WHERE playlist_id = $1",
        liked_playlist.id
    )
    .fetch_one(&mut *tx)
    .await?
    .unwrap_or(1);
    sqlx::query!(
        "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES ($1, $2, $3)",
        liked_playlist.id,
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
        liked_playlist.id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"
        INSERT INTO user_song_interactions (
            user_id,
            song_id,
            interaction_type
        )
        VALUES ($1, $2, 'like')
        "#,
        claims.sub,
        song_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    if let Err(error) = refresh_user_preference(&state.db, claims.sub).await {
        tracing::error!(
            "Failed to refresh preference for user {} after liking song {}: {:?}",
            claims.sub,
            song_id,
            error
        );
    }
    Ok((
        axum::http::StatusCode::CREATED,
        axum::Json(AddSongResponse {
            message: "Song liked successfully.".to_string(),
            warning: None,
        }),
    ))
}

#[utoipa::path(
    delete,
    path = "/songs/{song_id}/like",
    params(("song_id" = uuid::Uuid, Path, description = "Song ID")),
    responses(
        (status = 204, description = "Song unliked successfully"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Song was not liked"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Likes"]
)]
pub async fn unlike_song_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(song_id): axum::extract::Path<Uuid>,
) -> Result<axum::http::StatusCode, BSideError> {
    let mut tx = state.db.begin().await?;
    let liked_playlist = get_or_create_liked_playlist(&mut tx, claims.sub).await?;
    let info = sqlx::query!(
        r#"
        SELECT ps.id, s.duration_seconds
        FROM playlist_songs ps
        JOIN songs s ON s.id = ps.song_id
        WHERE ps.playlist_id = $1 AND ps.song_id = $2
        "#,
        liked_playlist.id,
        song_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(BSideError::NotFound)?;
    sqlx::query!("DELETE FROM playlist_songs WHERE id = $1", info.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!(
        "UPDATE playlists
            SET total_duration = total_duration - $1,
            song_count = song_count - 1
            WHERE id = $2",
        info.duration_seconds,
        liked_playlist.id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"
        INSERT INTO user_song_interactions (
            user_id,
            song_id,
            interaction_type
        )
        VALUES ($1, $2, 'unlike')
        "#,
        claims.sub,
        song_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    if let Err(error) = refresh_user_preference(&state.db, claims.sub).await {
        tracing::error!(
            "Failed to refresh preference for user {} after unliking song {}: {:?}",
            claims.sub,
            song_id,
            error
        );
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

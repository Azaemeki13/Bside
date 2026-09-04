//! Raw playback-interaction logging (play/complete/skip/replay), which feeds
//! the recommendation preference vector via [`refresh_user_preference`].

use crate::models::{PlaybackInteractionType, SongInteractionPayload};
use crate::preferences::refresh_user_preference;
use crate::{AppState, BSideError, Claims};
use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/songs/{song_id}/interactions",
    params(
        ("song_id" = uuid::Uuid, Path, description = "Song ID")
    ),
    request_body = SongInteractionPayload,
    responses(
        (status = 201, description = "Song interaction recorded successfully"),
        (status = 400, description = "Invalid interaction data or song not ready"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Song not found"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Interactions"]
)]
pub async fn record_song_interaction_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(song_id): Path<Uuid>,
    Json(payload): Json<SongInteractionPayload>,
) -> Result<axum::http::StatusCode, BSideError> {
    let song = sqlx::query!(
        r#"
        SELECT
            duration_seconds,
            status::text AS "status!"
        FROM songs
        WHERE id = $1
        "#,
        song_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    if song.status != "Ready" {
        return Err(BSideError::SongNotReady);
    }

    if song.duration_seconds <= 0 {
        return Err(BSideError::BadRequest(
            "Song duration must be greater than zero.".to_string(),
        ));
    }

    let SongInteractionPayload {
        interaction_type,
        listened_seconds,
    } = payload;

    let interaction_type = match interaction_type {
        PlaybackInteractionType::Play => "play",
        PlaybackInteractionType::Complete => "complete",
        PlaybackInteractionType::Skip => "skip",
        PlaybackInteractionType::Replay => "replay",
    };

    if matches!(interaction_type, "complete" | "skip") && listened_seconds.is_none() {
        return Err(BSideError::BadRequest(format!(
            "listened_seconds is required for interaction type '{interaction_type}'."
        )));
    }

    if let Some(seconds) = listened_seconds {
        if seconds < 0 {
            return Err(BSideError::BadRequest(
                "listened_seconds cannot be negative.".to_string(),
            ));
        }

        if seconds > song.duration_seconds {
            return Err(BSideError::BadRequest(format!(
                "listened_seconds cannot exceed the song duration of {} seconds.",
                song.duration_seconds
            )));
        }
    }

    sqlx::query!(
        r#"
        INSERT INTO user_song_interactions (
            user_id,
            song_id,
            interaction_type,
            listened_seconds,
            song_duration_seconds
        )
        VALUES ($1, $2, $3, $4, $5)
        "#,
        claims.sub,
        song_id,
        interaction_type,
        listened_seconds,
        song.duration_seconds
    )
    .execute(&state.db)
    .await?;
    if let Err(error) = refresh_user_preference(&state.db, claims.sub).await {
        tracing::error!(
            "Failed to refresh preference for user {} after '{}' interaction on song {}: {:?}",
            claims.sub,
            interaction_type,
            song_id,
            error
        );
    }
    Ok(axum::http::StatusCode::CREATED)
}

//! Song lifecycle: presigned upload, S3 verification (which kicks off async
//! ML analysis), the ML service's result callback, streaming, deletion, and
//! the public "new release" pick.
//!
//! The ML round trip: `verify_song_handler` fires-and-forgets a POST to the
//! `bside_ml_service` container's `/analyze` endpoint; that service downloads
//! the object from `MinIO`, runs audio analysis, and posts the result back to
//! `ml_callback_handler` at `/internal/songs/features` (authenticated with
//! the shared `PublicApiKey`, not a user JWT).

use super::util::{is_admin, validate_ml_json};
use crate::auth::PublicApiKey;
use crate::{AnyAuth, AppState, BSideError, Claims, MlCallbackPayload, NewReleaseSong, Song, SongPayload, SongResponse};
use aws_sdk_s3::presigning::PresigningConfig;
use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use std::time::Duration;
use uuid::Uuid;

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct NewReleaseParams {
    pub exclude_song_id: Option<Uuid>,
}

#[utoipa::path(
    post,
    path = "/songs",
    request_body = SongPayload,
    responses(
        (status = 200, description = "Song created successfully with upload URL", body = SongResponse),
        (status = 400, description = "Invalid format (only wav/flac allowed) or not album owner"),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Songs"]
)]
pub async fn create_song_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Json(payload): axum::extract::Json<SongPayload>,
) -> Result<Json<SongResponse>, BSideError> {
    if !matches!(payload.format.as_str(), "wav" | "flac") {
        return Err(BSideError::InvalidFormat);
    }
    let title = super::util::required_text(&payload.title, "Song title", 120)?;
    if !(1..=21_600).contains(&payload.duration_seconds) {
        return Err(BSideError::BadRequest(
            "Song duration must be 1-21600 seconds.".into(),
        ));
    }
    let is_owner = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM albums a
            JOIN artists ar ON ar.id = a.artist_id
            WHERE a.id = $1 AND ar.user_id = $2
        )
        "#,
        payload.album_id,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;
    let caller_is_admin = is_admin(&state, claims.sub).await?;

    if !is_owner.unwrap_or(false) && !caller_is_admin {
        return Err(BSideError::UnauthorizedProfile);
    }
    let song_uid = Uuid::new_v4();
    let s3_key = format!("{}/{}.{}", claims.sub, song_uid, payload.format);
    let expires_in = PresigningConfig::expires_in(Duration::from_secs(300))
        .map_err(|e| BSideError::S3Error(format!("Presigning config failure: {e}")))?;
    let presigned_request = state
        .public_aws_client
        .put_object()
        .bucket("bside-tracks")
        .key(&s3_key)
        .content_type(format!("audio/{}", payload.format))
        .presigned(expires_in)
        .await
        .map_err(|e| BSideError::S3Error(format!("Presigning request failure: {e}")))?;
    let upload_url = presigned_request.uri().to_string();
    let song = sqlx::query_as!(
        Song,
        r#"
        INSERT INTO songs (id, title, album_id, duration_seconds, audio_url, status, ml_features)
        VALUES ($1, $2, $3, $4, $5, 'Pending'::song_status, $6::jsonb)
        RETURNING id, title, album_id, duration_seconds, audio_url, status::text as "status!", ml_features, created_at as "created_at!"
        "#,
        song_uid,
        title,
        payload.album_id,
        payload.duration_seconds,
        s3_key,
        None::<serde_json::Value>
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(SongResponse { song, upload_url }))
}

#[utoipa::path(
    put,
    path = "/songs/{song_id}/verify",
    params(("song_id" = uuid::Uuid, Path, description = "Song ID")),
    responses(
        (status = 200, description = "Song verified and ready", body = serde_json::Value),
        (status = 400, description = "Invalid audio format or file too large"),
        (status = 401, description = "Unauthorized - not song owner"),
        (status = 404, description = "Song not found"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Songs"]
)]
pub async fn verify_song_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(song_id): axum::extract::Path<Uuid>,
) -> Result<axum::Json<serde_json::Value>, BSideError> {
    let song = sqlx::query!(
        "SELECT audio_url, album_id FROM songs WHERE id = $1",
        song_id
    )
    .fetch_one(&state.db)
    .await?;
    let is_owner = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM albums a
            JOIN artists ar ON ar.id = a.artist_id
            WHERE a.id = $1 AND ar.user_id = $2
        )
        "#,
        song.album_id,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);
    let caller_is_admin = is_admin(&state, claims.sub).await?;
    if !is_owner && !caller_is_admin {
        return Err(BSideError::UnauthorizedProfile);
    }
    let object_metadata = state
        .aws_client
        .head_object()
        .bucket("bside-tracks")
        .key(&song.audio_url)
        .send()
        .await
        .map_err(|e| {
            if e.to_string().contains("NoSuchKey") || e.to_string().contains("NotFound") {
                BSideError::NotFound
            } else {
                BSideError::S3Error(format!("S3 metadata error: {e}"))
            }
        })?;
    let content_length = object_metadata
        .content_length()
        .filter(|length| *length >= 0)
        .ok_or_else(|| {
            BSideError::S3Error("S3 object size metadata is missing or invalid.".into())
        })?;
    let max_size = 200 * 1024 * 1024;
    if content_length > max_size {
        let _ = state
            .aws_client
            .delete_object()
            .bucket("bside-tracks")
            .key(&song.audio_url)
            .send()
            .await;
        sqlx::query!("DELETE FROM songs WHERE id = $1", song_id)
            .execute(&state.db)
            .await?;
        return Err(BSideError::PayloadTooLarge);
    }
    let get_request = state
        .aws_client
        .get_object()
        .bucket("bside-tracks")
        .key(&song.audio_url)
        .range("bytes=0-31")
        .send()
        .await
        .map_err(|e| {
            if e.to_string().contains("NoSuchKey") {
                BSideError::NotFound
            } else {
                BSideError::S3Error(format!("S3 Fetch Error: {e}"))
            }
        })?;
    let body = get_request.body.collect().await.map_err(|e| {
        tracing::error!("S3 Body Collection Error: {:?}", e);
        BSideError::S3Error(format!("Streaming Error: {e}"))
    })?;
    let bytes = body.into_bytes();
    if bytes.len() < 4 || (&bytes[..4] != b"fLaC" && &bytes[..4] != b"RIFF") {
        let _ = state
            .aws_client
            .delete_object()
            .bucket("bside-tracks")
            .key(&song.audio_url)
            .send()
            .await;
        let _ = sqlx::query!("DELETE FROM songs WHERE id = $1", song_id)
            .execute(&state.db)
            .await?;
        return Err(BSideError::InvalidFormat);
    }
    let ml_client = state.http_client.clone();
    let track_id_clone = song_id;
    let s3_key_clone = song.audio_url.clone();
    tokio::spawn(async move {
        let payload = serde_json::json!({
            "track_id": track_id_clone,
            "object_key": s3_key_clone
        });
        let res = ml_client
            .post("http://bside_ml_service:8000/analyze")
            .json(&payload)
            .send()
            .await;
        if let Err(e) = res {
            tracing::error!(
                "Failed to notify ML Microservice for song {}: {:?}",
                track_id_clone,
                e
            );
        }
    });
    let _response = sqlx::query!(
        "UPDATE songs SET status = 'Pending'::song_status WHERE id = $1",
        song_id
    )
    .execute(&state.db)
    .await?;
    Ok(axum::Json(serde_json::json!({"status": "processing_ml"})))
}

/// Receives the finished analysis from the ML microservice and marks the
/// song (and its now-playable album) `Ready`. Authenticated with the shared
/// `X-API-Key`, since the ML service has no user session.
pub async fn ml_callback_handler(
    State(state): State<AppState>,
    _key: PublicApiKey,
    axum::extract::Json(payload): axum::extract::Json<MlCallbackPayload>,
) -> Result<axum::Json<serde_json::Value>, BSideError> {
    validate_ml_json(&payload.dsp_analysis, "dsp_analysis")?;
    validate_ml_json(&payload.ml_features, "ml_features")?;
    if payload.normalized_vector.len() != 6
        || payload
            .normalized_vector
            .iter()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
    {
        return Err(BSideError::BadRequest(
            "normalized_vector must contain exactly 6 finite values between 0 and 1.".into(),
        ));
    }

    let mut tx = state.db.begin().await?;
    let updated = sqlx::query(
        r#"
        UPDATE songs
        SET status = 'Ready'::song_status,
            ml_features = $2,
            normalized_vector = $3
        WHERE id = $1 AND status = 'Pending'
        "#,
    )
    .bind(payload.track_id)
    .bind(&payload.ml_features)
    .bind(&payload.normalized_vector)
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(BSideError::NotFound);
    }

    // The album is created as 'Pending' and only becomes visible (in search,
    // catalog listings, etc.) once it actually has a verified, playable song.
    sqlx::query!(
        r#"
        UPDATE albums
        SET status = 'Ready'
        WHERE id = (SELECT album_id FROM songs WHERE id = $1) AND status = 'Pending'
        "#,
        payload.track_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(axum::Json(serde_json::json!({"status": "processed"})))
}

pub async fn get_song_stream_url_handler(
    State(state): State<AppState>,
    auth: AnyAuth,
    Path(song_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, BSideError> {
    let song = sqlx::query!(
        r#"
        SELECT audio_url, status::text as "status!"
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
    match auth {
        AnyAuth::User(_claims) => {
            let expires_in = PresigningConfig::expires_in(Duration::from_secs(300))
                .map_err(|e| BSideError::S3Error(format!("Presigning config failure: {e}")))?;
            let presigned_request = state
                .public_aws_client
                .get_object()
                .bucket("bside-tracks")
                .key(&song.audio_url)
                .presigned(expires_in)
                .await
                .map_err(|e| BSideError::S3Error(format!("Presigning request failure: {e}")))?;
            Ok(Json(serde_json::json!({
                "url": presigned_request.uri().to_string(),
                "expires_in": 300,
                "is_anonymous": false,
            })))
        }
        AnyAuth::Anonymous | AnyAuth::ApiKey => Ok(Json(serde_json::json!({
            "url": "Try me :)",
            "expires_in": 0,
            "is_anonymous": true
        }))),
    }
}

#[utoipa::path(
    get,
    path = "/new-release",
    params(("exclude_song_id" = Option<uuid::Uuid>, Query, description = "Previously displayed song to avoid when the latest album has another ready track")),
    responses(
        (status = 200, description = "Random ready song from the newest ready album", body = NewReleaseSong),
        (status = 404, description = "No ready song is available"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Songs"]
)]
pub async fn get_new_release_handler(
    State(state): State<AppState>,
    Query(params): Query<NewReleaseParams>,
) -> Result<Json<NewReleaseSong>, BSideError> {
    let excluded_song_id = params.exclude_song_id;

    let song = sqlx::query_as!(
        NewReleaseSong,
        r#"
        SELECT
            s.id AS song_id,
            s.title,
            s.audio_url,
            a.id AS album_id,
            a.title AS album_title,
            a.cover_url,
            ar.id AS artist_id,
            ar.name AS artist_name
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        JOIN artists ar ON ar.id = a.artist_id
        WHERE s.status = 'Ready'
          AND a.id = (
              SELECT latest.id
              FROM albums latest
              WHERE latest.status = 'Ready'
                AND EXISTS (
                    SELECT 1
                    FROM songs ready_song
                    WHERE ready_song.album_id = latest.id
                      AND ready_song.status = 'Ready'
                )
              ORDER BY latest.created_at DESC
              LIMIT 1
          )
        ORDER BY (s.id = $1) ASC NULLS LAST, RANDOM()
        LIMIT 1
        "#,
        excluded_song_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(Json(song))
}

#[utoipa::path(
    delete,
    path = "/songs/{id}",
    params(("id" = uuid::Uuid, Path, description = "Song ID")),
    responses(
        (status = 204, description = "Song deleted successfully"),
        (status = 401, description = "Unauthorized - not song owner"),
        (status = 404, description = "Song not found"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Songs"]
)]
pub async fn delete_song_handler(
    state: State<AppState>,
    claims: Claims,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<impl IntoResponse, BSideError> {
    let mut tx = state.db.begin().await?;
    let owner = sqlx::query_as::<_, (Option<Uuid>, i32, String)>(
        "SELECT ar.user_id, s.duration_seconds, s.audio_url
        FROM songs s
        JOIN albums a on s.album_id = a.id
        JOIN artists ar ON ar.id = a.artist_id
        WHERE s.id = $1",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(BSideError::NotFound)?;
    let caller_is_admin = is_admin(&state, claims.sub).await?;
    if owner.0 != Some(claims.sub) && !caller_is_admin {
        return Err(BSideError::UnauthorizedProfile);
    }
    sqlx::query!(
        r#"
        UPDATE playlists p
        SET
            total_duration = total_duration - (sub.occurences * $1),
            song_count = song_count - sub.occurences
        FROM (
            SELECT playlist_id, count(*) as occurences
            FROM playlist_songs
            WHERE song_id = $2
            GROUP BY playlist_id
        ) AS sub
            WHERE p.id = sub.playlist_id"#,
        i64::from(owner.1),
        id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!("DELETE FROM songs WHERE id = $1", id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let _ = state
        .aws_client
        .delete_object()
        .bucket("bside-tracks")
        .key(owner.2)
        .send()
        .await;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

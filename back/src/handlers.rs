use crate::{
    AddSongResponse, AlbumPayload, AlbumResponse, AppState, AuthRequest, BSideError, Claims,
    GoogleUserProfile, Playlist, PlaylistDetailedResponse, PlaylistPayload, PlaylistSongItem, Song,
    SongPayload, SongResponse, UpdateStructurePayload, User, UserPayload,
};
use aws_sdk_s3::presigning::PresigningConfig;
use axum::{
    Json,
    extract::Path,
    extract::State,
    response::{IntoResponse, Redirect},
};
use oauth2::{AuthorizationCode, CsrfToken, Scope, TokenResponse};
use std::time::Duration;
use uuid::Uuid;

#[axum::debug_handler]
pub async fn ping_handler() -> &'static str {
    "pong"
}

#[axum::debug_handler]
pub async fn create_user_handler(
    State(state): State<AppState>,
    axum::extract::Json(payload): axum::extract::Json<UserPayload>,
) -> Result<Json<User>, BSideError> {
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username) VALUES ($1) RETURNING id, username, created_at",
    )
    .bind(payload.username)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(user))
}

pub async fn get_me_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<User>, BSideError> {
    let result = sqlx::query_as!(
        User,
        r#"SELECT id, username, created_at as "created_at!" FROM users WHERE id = $1"#,
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;
    Ok(Json(result))
}

pub async fn get_all_users_handler(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<User>>, BSideError> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, username, created_at FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(axum::Json(users))
}

pub async fn get_user_by_id_handler(
    State(state): State<AppState>,
    Path(user_id): Path<uuid::Uuid>,
    _claims: Claims,
) -> Result<Json<User>, BSideError> {
    let user =
        sqlx::query_as::<_, User>("SELECT id, username, created_at FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(BSideError::UserNotFound)?;
    Ok(Json(user))
}

pub async fn create_album_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Json(payload): axum::extract::Json<AlbumPayload>,
) -> Result<Json<AlbumResponse>, BSideError> {
    let trimmed_title = payload.title.trim();
    if trimmed_title.is_empty() {
        return Err(BSideError::BadRequest(
            "Album title cannot be empty !".to_string(),
        ));
    }
    if trimmed_title.len() > 100 {
        return Err(BSideError::BadRequest(
            "Album title cannot be more than 100 chars!".to_string(),
        ));
    }
    let result = sqlx::query_scalar!(
        r#"
        INSERT INTO albums (title, owner_id)
        VALUES ($1, $2)
        RETURNING id
        "#,
        trimmed_title,
        claims.sub
    )
    .fetch_one(&state.db)
    .await;
    match result {
        Ok(album_id) => Ok(Json(AlbumResponse {
            id: album_id,
            title: trimmed_title.to_string(),
            message: "Album create successfully".to_string(),
        })),
        Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => Err(
            BSideError::Conflict("You already have an album with this title!".to_string()),
        ),
        Err(e) => Err(BSideError::SqlxError(e)),
    }
}

pub async fn create_song_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Json(payload): axum::extract::Json<SongPayload>,
) -> Result<Json<SongResponse>, BSideError> {
    if !matches!(payload.format.as_str(), "wav" | "flac") {
        return Err(BSideError::InvalidFormat);
    }
    let is_owner = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM albums WHERE id = $1 AND owner_id = $2)",
        payload.album_id,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;
    if !is_owner.unwrap_or(false) {
        return Err(BSideError::UnauthorizedProfile);
    }
    let song_uid = Uuid::new_v4();
    let s3_key = format!("{}/{}.{}", claims.sub, song_uid, payload.format);
    let expires_in = PresigningConfig::expires_in(Duration::from_secs(300))
        .map_err(|e| BSideError::S3Error(format!("Presigning config failure: {e}")))?;
    let presigned_request = state
        .aws_client
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
        payload.title,
        payload.album_id,
        payload.duration_seconds,
        s3_key,
        payload.ml_features
    )
    .fetch_one(&state.db)
    .await?;
    Ok(Json(SongResponse { song, upload_url }))
}

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
        "SELECT EXISTS(SELECT 1 FROM albums WHERE id = $1 AND owner_id = $2)",
        song.album_id,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);
    if !is_owner {
        return Err(BSideError::UnauthorizedProfile);
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
    let content_length = get_request.content_length().unwrap_or(0);
    let max_size = 200 * 1024 * 1024;
    if content_length > max_size {
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
        return Err(BSideError::PayloadTooLarge);
    }
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
    let _response = sqlx::query!(
        "UPDATE songs SET status = 'Ready'::song_status WHERE id = $1",
        song_id
    )
    .execute(&state.db)
    .await?;
    Ok(axum::Json(serde_json::json!({"status": "verified"})))
}

pub async fn delete_song_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<axum::http::StatusCode, BSideError> {
    let mut tx = state.db.begin().await?;
    let owner = sqlx::query!(
        "SELECT a.owner_id, s.duration_seconds 
        FROM songs s
        JOIN albums a on s.album_id = a.id
        WHERE s.id = $1",
        id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(BSideError::NotFound)?;
    if owner.owner_id != claims.sub {
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
        i64::from(owner.duration_seconds),
        id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(r#"UPDATE songs SET status = 'Deleted' WHERE id = $1 "#, id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn _flush_deleted_songs_task(state: &AppState) -> Result<u64, BSideError> {
    let batch_size = 50;
    let mut total_purged = 0;
    loop {
        let candidates = sqlx::query!(
            r#"SELECT id, audio_url FROM songs WHERE status = 'Deleted' LIMIT $1"#,
            batch_size
        )
        .fetch_all(&state.db)
        .await?;
        if candidates.is_empty() {
            break;
        }
        let mut delete_builder = aws_sdk_s3::types::Delete::builder();
        for song in &candidates {
            let obj = aws_sdk_s3::types::ObjectIdentifier::builder()
                .key(&song.audio_url)
                .build()
                .map_err(|e| BSideError::BadRequest(e.to_string()))?;
            delete_builder = delete_builder.objects(obj);
        }
        let response = state
            .aws_client
            .delete_objects()
            .bucket("bside-tracks")
            .delete(
                delete_builder
                    .build()
                    .map_err(|e| BSideError::BadRequest(e.to_string()))?,
            )
            .send()
            .await
            .map_err(|e| BSideError::S3Error(e.to_string()))?;
        let mut successful_ids = Vec::new();
        for deleted in response.deleted() {
            if let Some(key) = deleted.key()
                && let Some(c) = candidates.iter().find(|c| c.audio_url == key)
            {
                successful_ids.push(c.id);
            }
        }
        if !successful_ids.is_empty() {
            let result = sqlx::query!("DELETE FROM songs WHERE id = ANY($1)", &successful_ids[..])
                .execute(&state.db)
                .await?;
            total_purged += result.rows_affected();
        }
        if candidates.len() < batch_size.try_into().expect("Couldn't allocate size ?") {
            break;
        }
    }
    Ok(total_purged)
}

pub async fn create_playlist_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Json(payload): axum::extract::Json<PlaylistPayload>,
) -> Result<Json<Playlist>, BSideError> {
    let playlist = sqlx::query_as!
        (Playlist, r#"INSERT INTO playlists (title, owner_id, is_public) VALUES ($1, $2, true) RETURNING id, title, owner_id, is_public as "is_public!", created_at as "created_at!" "#, payload.title, claims.sub)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(playlist))
}

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
    let warning = if is_duplicate {
        Some("Note: This song is already in this playlist !".to_string())
    } else {
        None
    };
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
        "UPDATE playlists SET total_duration = total_duration + $1,
        song_count = song_count + 1,
        ml_features = ml_features || $2
        WHERE id = $3",
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
            warning,
        }),
    ))
}

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
                    'position', ps.position
                ) ORDER BY ps.position)
                 FROM playlist_songs ps
                 JOIN songs s ON ps.song_id = s.id
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
        songs: playlist.songs.0,
    }))
}

pub async fn update_playlist_handler(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    axum::extract::Json(payload): axum::extract::Json<UpdateStructurePayload>,
) -> Result<axum::Json<serde_json::Value>, BSideError> {
    let res = sqlx::query!(
        "UPDATE playlists
        SET
            title = COALESCE($1, title),
            description = COALESCE($2, description),
            is_public = COALESCE($3, is_public)
        WHERE id = $4 and owner_id = $5",
        payload.title,
        payload.description,
        payload.is_public,
        id,
        claims.sub
    )
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(BSideError::UnauthorizedProfile);
    }
    Ok(axum::Json(serde_json::json!({ "status": "updated"})))
}

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

pub async fn google_login_handler(State(state): State<AppState>) -> impl IntoResponse {
    let (auth_url, _cfrs_token) = state
        .oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .url();
    Redirect::temporary(auth_url.as_str())
}

pub async fn google_callback_handler(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<AuthRequest>,
) -> Result<impl IntoResponse, BSideError> {
    let code = AuthorizationCode::new(query.code);

    let token_result = state
        .oauth_client
        .exchange_code(code)
        .request_async(&state.http_client)
        .await
        .map_err(|e| BSideError::AuthError(format!("OAuth exchange failed: {e}")))?;

    let access_token = token_result.access_token().secret();
    let profile_response = state
        .http_client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await?;
    let profile: GoogleUserProfile = profile_response.json().await?;
    let existing_user = sqlx::query!("SELECT id from users WHERE email = $1", profile.email)
        .fetch_optional(&state.db)
        .await?;
    let user_id = if let Some(record) = existing_user {
        record.id
    } else {
        println!("New use, inserting into database...");
        let new_id = uuid::Uuid::new_v4();
        sqlx::query!(
            "INSERT into users (id, email, username) VALUES ($1, $2, $3)",
            new_id,
            profile.email,
            profile.name
        )
        .execute(&state.db)
        .await?;
        new_id
    };
    let jwt = crate::auth::create_jwt(user_id)?;
    let redirect_url = format!("http://localhost:8081?token={jwt}");
    Ok(Redirect::to(&redirect_url))
}

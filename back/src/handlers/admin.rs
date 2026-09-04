//! Admin/moderator-only endpoints: user moderation, account management,
//! and creating albums on behalf of an artist.

use super::util::{ensure_admin, ensure_admin_or_moderator, public_storage_url, required_text, validate_genre};
use crate::{AdminUpdateUserPayload, AlbumResponse, AppState, BSideError, Claims, User};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use uuid::Uuid;

pub async fn ban_user_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(user_id): Path<Uuid>,
) -> Result<Json<User>, BSideError> {
    ensure_admin_or_moderator(&state, claims.sub).await?;

    if user_id == claims.sub {
        return Err(BSideError::BadRequest("You cannot ban yourself.".into()));
    }

    let user = sqlx::query_as!(
        User,
        r#"
        UPDATE users
        SET is_banned = TRUE
        WHERE id = $1
        RETURNING id, username, display_name, email, avatar_url, role, is_banned, created_at as "created_at!"
        "#,
        user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;

    Ok(Json(user))
}

pub async fn unban_user_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(user_id): Path<Uuid>,
) -> Result<Json<User>, BSideError> {
    ensure_admin_or_moderator(&state, claims.sub).await?;

    let user = sqlx::query_as!(
        User,
        r#"
        UPDATE users
        SET is_banned = FALSE
        WHERE id = $1
        RETURNING id, username, display_name, email, avatar_url, role, is_banned, created_at as "created_at!"
        "#,
        user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;

    Ok(Json(user))
}

#[utoipa::path(
    get,
    path = "/admin/users",
    responses(
        (status = 200, description = "Full list of all users (admin/moderator only)", body = Vec<User>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Requires admin or moderator role"),
    ),
    security(("Bearer" = [])),
    tags = ["Admin"]
)]
pub async fn admin_get_all_users_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<User>>, BSideError> {
    ensure_admin_or_moderator(&state, claims.sub).await?;

    let users = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, display_name, email, avatar_url, role, is_banned, created_at
        FROM users
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}

#[utoipa::path(
    patch,
    path = "/admin/users/{user_id}",
    params(("user_id" = uuid::Uuid, Path, description = "User ID")),
    request_body = AdminUpdateUserPayload,
    responses(
        (status = 200, description = "User updated", body = User),
        (status = 400, description = "Invalid role or display name"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "User not found"),
    ),
    security(("Bearer" = [])),
    tags = ["Admin"]
)]
pub async fn admin_update_user_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(user_id): Path<Uuid>,
    Json(payload): Json<AdminUpdateUserPayload>,
) -> Result<Json<User>, BSideError> {
    ensure_admin(&state, claims.sub).await?;

    if let Some(ref role) = payload.role {
        if !matches!(role.as_str(), "Admin" | "Moderator" | "User") {
            return Err(BSideError::BadRequest(
                "Role must be one of Admin, Moderator, User.".into(),
            ));
        }
        if user_id == claims.sub {
            return Err(BSideError::BadRequest(
                "You cannot change your own role.".into(),
            ));
        }
    }

    let display_name = match payload.display_name {
        Some(ref raw) => {
            let trimmed = raw.trim();
            if trimmed.chars().count() > 50 {
                return Err(BSideError::BadRequest(
                    "Display name must be 50 characters or fewer.".into(),
                ));
            }
            Some(if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            })
        }
        None => None,
    };

    let user = sqlx::query_as!(
        User,
        r#"
        UPDATE users
        SET
            display_name = CASE WHEN $2 THEN $3 ELSE display_name END,
            role = COALESCE($4, role)
        WHERE id = $1
        RETURNING id, username, display_name, email, avatar_url, role, is_banned, created_at as "created_at!"
        "#,
        user_id,
        display_name.is_some(),
        display_name.flatten(),
        payload.role
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;

    Ok(Json(user))
}

#[utoipa::path(
    delete,
    path = "/admin/users/{user_id}",
    params(("user_id" = uuid::Uuid, Path, description = "User ID")),
    responses(
        (status = 204, description = "User deleted"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "User not found"),
        (status = 409, description = "User owns an artist profile and cannot be deleted"),
    ),
    security(("Bearer" = [])),
    tags = ["Admin"]
)]
pub async fn admin_delete_user_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(user_id): Path<Uuid>,
) -> Result<StatusCode, BSideError> {
    ensure_admin(&state, claims.sub).await?;

    if user_id == claims.sub {
        return Err(BSideError::BadRequest(
            "You cannot delete your own account.".into(),
        ));
    }

    let owns_artist = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM artists WHERE user_id = $1)",
        user_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);

    if owns_artist {
        return Err(BSideError::Conflict(
            "This user owns an artist profile; reassign or remove it before deleting the user."
                .into(),
        ));
    }

    let deleted = sqlx::query!("DELETE FROM users WHERE id = $1", user_id)
        .execute(&state.db)
        .await?;

    if deleted.rows_affected() == 0 {
        return Err(BSideError::UserNotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/admin/artists/{artist_id}/albums",
    params(("artist_id" = uuid::Uuid, Path, description = "Target artist ID")),
    request_body(content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Album created for artist", body = AlbumResponse),
        (status = 401, description = "Unauthorized or not admin"),
        (status = 404, description = "Artist not found"),
    )
)]
pub async fn admin_create_album_for_artist_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(artist_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<Json<AlbumResponse>, BSideError> {
    ensure_admin(&state, claims.sub).await?;

    let artist_exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM artists WHERE id = $1)",
        artist_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);

    if !artist_exists {
        return Err(BSideError::NotFound);
    }

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

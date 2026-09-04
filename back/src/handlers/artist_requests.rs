//! The "become an artist" workflow: a user submits a request, an admin
//! approves or denies it. Approval promotes the user to the Artist role and
//! creates their artist profile.

use super::util::{ensure_admin, optional_text, public_storage_url, required_text};
use crate::{
    AppState, ArtistRequestPayload, ArtistRequestResponse, ArtistRequestReviewPayload, BSideError,
    Claims,
};
use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/artist-requests",
    request_body = ArtistRequestPayload,
    responses(
        (status = 200, description = "Artist request created", body = ArtistRequestResponse),
        (status = 400, description = "Invalid request"),
        (status = 409, description = "Pending request already exists"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Artists"]
)]
pub async fn create_artist_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<ArtistRequestPayload>,
) -> Result<Json<ArtistRequestResponse>, BSideError> {
    let artist_name = required_text(&payload.artist_name, "Artist name", 100)?;
    let bio = optional_text(payload.bio, "Artist bio", 2_000)?;

    let request_id = Uuid::new_v4();
    let result = sqlx::query_as!(
        ArtistRequestResponse,
        r#"
        INSERT INTO artist_requests (id, user_id, artist_name, bio)
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            user_id,
            (SELECT username FROM users WHERE id = $2) AS "username!",
            (SELECT email FROM users WHERE id = $2) AS "email!",
            artist_name,
            bio,
            status,
            reviewed_by,
            reviewed_at,
            created_at AS "created_at!"
        "#,
        request_id,
        claims.sub,
        artist_name,
        bio
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(db_error) = &e
            && db_error.is_unique_violation()
        {
            return BSideError::Conflict("A pending artist request already exists.".into());
        }
        BSideError::SqlxError(e)
    })?;

    Ok(Json(result))
}

#[utoipa::path(
    get,
    path = "/admin/artist-requests",
    responses(
        (status = 200, description = "Pending artist requests", body = Vec<ArtistRequestResponse>),
        (status = 403, description = "Admin role required"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Admin"]
)]
pub async fn get_artist_requests_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<ArtistRequestResponse>>, BSideError> {
    ensure_admin(&state, claims.sub).await?;

    let requests = sqlx::query_as!(
        ArtistRequestResponse,
        r#"
        SELECT
            ar.id,
            ar.user_id,
            u.username,
            u.email,
            ar.artist_name,
            ar.bio,
            ar.status,
            ar.reviewed_by,
            ar.reviewed_at,
            ar.created_at AS "created_at!"
        FROM artist_requests ar
        JOIN users u ON u.id = ar.user_id
        WHERE ar.status = 'Pending'
        ORDER BY ar.created_at ASC
        "#
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(requests))
}

#[utoipa::path(
    put,
    path = "/admin/artist-requests/{request_id}",
    params(("request_id" = uuid::Uuid, Path, description = "Artist request ID")),
    request_body = ArtistRequestReviewPayload,
    responses(
        (status = 200, description = "Artist request reviewed", body = ArtistRequestResponse),
        (status = 400, description = "Invalid decision"),
        (status = 403, description = "Admin role required"),
        (status = 404, description = "Pending request not found"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Admin"]
)]
pub async fn review_artist_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(request_id): Path<Uuid>,
    Json(payload): Json<ArtistRequestReviewPayload>,
) -> Result<Json<ArtistRequestResponse>, BSideError> {
    ensure_admin(&state, claims.sub).await?;

    let decision = payload.decision.trim();
    if decision != "Accepted" && decision != "Denied" {
        return Err(BSideError::BadRequest(
            "Decision must be Accepted or Denied.".into(),
        ));
    }

    let mut tx = state.db.begin().await?;
    let request = sqlx::query!(
        r#"
        SELECT id, user_id, artist_name, bio
        FROM artist_requests
        WHERE id = $1 AND status = 'Pending'
        "#,
        request_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(BSideError::NotFound)?;

    if decision == "Accepted" {
        let artist_id = Uuid::new_v4();
        let existing_artist_id =
            sqlx::query_scalar!("SELECT id FROM artists WHERE user_id = $1", request.user_id)
                .fetch_optional(&mut *tx)
                .await?;

        if existing_artist_id.is_none() {
            sqlx::query!(
                r#"
                INSERT INTO artists (id, user_id, name, bio, photo_url, status)
                VALUES ($1, $2, $3, $4, $5, 'Ready')
                "#,
                artist_id,
                request.user_id,
                request.artist_name,
                request.bio,
                public_storage_url("bside-covers", "default_artist.jpg")
            )
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query!(
            "UPDATE users SET role = 'Artist' WHERE id = $1 AND role = 'User'",
            request.user_id
        )
        .execute(&mut *tx)
        .await?;
    }

    let reviewed = sqlx::query_as!(
        ArtistRequestResponse,
        r#"
        UPDATE artist_requests
        SET status = $2, reviewed_by = $3, reviewed_at = NOW()
        WHERE id = $1
        RETURNING
            id,
            user_id,
            (SELECT username FROM users WHERE id = artist_requests.user_id) AS "username!",
            (SELECT email FROM users WHERE id = artist_requests.user_id) AS "email!",
            artist_name,
            bio,
            status,
            reviewed_by,
            reviewed_at,
            created_at AS "created_at!"
        "#,
        request_id,
        decision,
        claims.sub
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(reviewed))
}

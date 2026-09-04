//! Public-facing user directory endpoints (no email/role/ban data exposed).

use crate::{AppState, BSideError, Claims, PublicUser};
use axum::{Json, extract::State, extract::Path};

#[utoipa::path(
    get,
    path = "/users",
    responses(
        (status = 200, description = "Public list of all users (no email/role/ban data)", body = Vec<PublicUser>),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
pub async fn get_all_users_handler(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<PublicUser>>, BSideError> {
    let users = sqlx::query_as::<_, PublicUser>(
        r#"
        SELECT id, username, display_name, avatar_url
        FROM users
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}

#[utoipa::path(
    get,
    path = "/users/{id}",
    params(("id" = uuid::Uuid, Path, description = "User ID")),
    responses(
        (status = 200, description = "Public profile for the given user", body = PublicUser),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "User not found"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
pub async fn get_user_by_id_handler(
    State(state): State<AppState>,
    Path(user_id): Path<uuid::Uuid>,
    _claims: Claims,
) -> Result<Json<PublicUser>, BSideError> {
    let user = sqlx::query_as::<_, PublicUser>(
        r#"
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;

    Ok(Json(user))
}

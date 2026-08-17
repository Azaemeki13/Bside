use crate::auth::PublicApiKey;
use crate::{AppState, BSideError};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow, utoipa::ToSchema)]
pub struct PublicApiArtist {
    pub id: Uuid,
    pub name: String,
    pub bio: Option<String>,
    pub photo_url: String,
    pub status: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct PublicApiArtistPayload {
    pub name: String,
    pub bio: Option<String>,
    pub photo_url: String,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct PublicApiListParams {
    #[serde(default = "default_page")]
    page: i64,
    #[serde(default = "default_page_size")]
    page_size: i64,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct PublicApiArtistList {
    pub artists: Vec<PublicApiArtist>,
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

const fn default_page() -> i64 {
    1
}
const fn default_page_size() -> i64 {
    20
}

fn normalized_payload(
    payload: PublicApiArtistPayload,
) -> Result<PublicApiArtistPayload, BSideError> {
    let name = payload.name.trim().to_string();
    let bio = payload
        .bio
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let photo_url = payload.photo_url.trim().to_string();
    if !(1..=100).contains(&name.chars().count()) {
        return Err(BSideError::BadRequest(
            "Artist name must be 1-100 characters.".into(),
        ));
    }
    if bio
        .as_ref()
        .is_some_and(|value| value.chars().count() > 2_000)
    {
        return Err(BSideError::BadRequest(
            "Artist bio must not exceed 2000 characters.".into(),
        ));
    }
    let is_local_path = photo_url.starts_with('/') && !photo_url.starts_with("//");
    if photo_url.len() > 2_048 || !(photo_url.starts_with("https://") || is_local_path) {
        return Err(BSideError::BadRequest(
            "Photo URL must be HTTPS or a local path.".into(),
        ));
    }
    Ok(PublicApiArtistPayload {
        name,
        bio,
        photo_url,
    })
}

#[utoipa::path(get, path = "/public-api/artists", params(PublicApiListParams),
    responses((status = 200, body = PublicApiArtistList), (status = 401, description = "Invalid API key"), (status = 429, description = "Rate limit exceeded")),
    security(("api_key" = [])), tags = ["Public API"])]
pub async fn list_artists(
    State(state): State<AppState>,
    _key: PublicApiKey,
    Query(params): Query<PublicApiListParams>,
) -> Result<Json<PublicApiArtistList>, BSideError> {
    if params.page < 1 || !(1..=100).contains(&params.page_size) {
        return Err(BSideError::BadRequest("Invalid pagination.".into()));
    }
    let offset = (params.page - 1)
        .checked_mul(params.page_size)
        .ok_or_else(|| BSideError::BadRequest("Pagination is too large.".into()))?;
    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM artists WHERE status = 'Ready'")
        .fetch_one(&state.db)
        .await?;
    let artists = sqlx::query_as::<_, PublicApiArtist>(
        "SELECT id, name, bio, photo_url, status FROM artists WHERE status = 'Ready' ORDER BY name, id LIMIT $1 OFFSET $2"
    ).bind(params.page_size).bind(offset).fetch_all(&state.db).await?;
    Ok(Json(PublicApiArtistList {
        artists,
        page: params.page,
        page_size: params.page_size,
        total,
    }))
}

#[utoipa::path(post, path = "/public-api/artists", request_body = PublicApiArtistPayload,
    responses((status = 201, body = PublicApiArtist), (status = 400, description = "Invalid payload"), (status = 401, description = "Invalid API key"), (status = 429, description = "Rate limit exceeded")),
    security(("api_key" = [])), tags = ["Public API"])]
pub async fn create_artist(
    State(state): State<AppState>,
    _key: PublicApiKey,
    Json(payload): Json<PublicApiArtistPayload>,
) -> Result<(StatusCode, Json<PublicApiArtist>), BSideError> {
    let payload = normalized_payload(payload)?;
    let artist_id = Uuid::new_v4();
    let artist = sqlx::query_as::<_, PublicApiArtist>(
        "INSERT INTO artists (id, name, bio, photo_url, status, api_managed) VALUES ($1, $2, $3, $4, 'Ready', TRUE) RETURNING id, name, bio, photo_url, status"
    ).bind(artist_id).bind(payload.name).bind(payload.bio).bind(payload.photo_url).fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(artist)))
}

#[utoipa::path(get, path = "/public-api/artists/{id}", params(("id" = Uuid, Path)),
    responses((status = 200, body = PublicApiArtist), (status = 404, description = "Artist not found"), (status = 401, description = "Invalid API key"), (status = 429, description = "Rate limit exceeded")),
    security(("api_key" = [])), tags = ["Public API"])]
pub async fn get_artist(
    State(state): State<AppState>,
    _key: PublicApiKey,
    Path(id): Path<Uuid>,
) -> Result<Json<PublicApiArtist>, BSideError> {
    let artist = sqlx::query_as::<_, PublicApiArtist>(
        "SELECT id, name, bio, photo_url, status FROM artists WHERE id = $1 AND status = 'Ready'",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;
    Ok(Json(artist))
}

#[utoipa::path(put, path = "/public-api/artists/{id}", params(("id" = Uuid, Path)), request_body = PublicApiArtistPayload,
    responses((status = 200, body = PublicApiArtist), (status = 400, description = "Invalid payload"), (status = 401, description = "Invalid API key"), (status = 404, description = "Artist not found or not API-managed"), (status = 429, description = "Rate limit exceeded")),
    security(("api_key" = [])), tags = ["Public API"])]
pub async fn update_artist(
    State(state): State<AppState>,
    _key: PublicApiKey,
    Path(id): Path<Uuid>,
    Json(payload): Json<PublicApiArtistPayload>,
) -> Result<Json<PublicApiArtist>, BSideError> {
    let payload = normalized_payload(payload)?;
    let artist = sqlx::query_as::<_, PublicApiArtist>(
        "UPDATE artists SET name = $2, bio = $3, photo_url = $4 WHERE id = $1 AND api_managed = TRUE RETURNING id, name, bio, photo_url, status"
    ).bind(id).bind(payload.name).bind(payload.bio).bind(payload.photo_url)
    .fetch_optional(&state.db).await?.ok_or(BSideError::NotFound)?;
    Ok(Json(artist))
}

#[utoipa::path(delete, path = "/public-api/artists/{id}", params(("id" = Uuid, Path)),
    responses((status = 204, description = "Artist deleted"), (status = 401, description = "Invalid API key"), (status = 404, description = "Artist not found or not API-managed"), (status = 429, description = "Rate limit exceeded")),
    security(("api_key" = [])), tags = ["Public API"])]
pub async fn delete_artist(
    State(state): State<AppState>,
    _key: PublicApiKey,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, BSideError> {
    let result = sqlx::query("DELETE FROM artists WHERE id = $1 AND api_managed = TRUE")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(BSideError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_artist_payload() {
        assert!(
            normalized_payload(PublicApiArtistPayload {
                name: " Artist ".into(),
                bio: Some(" Bio ".into()),
                photo_url: "https://example.com/photo.jpg".into()
            })
            .is_ok()
        );
        assert!(
            normalized_payload(PublicApiArtistPayload {
                name: "".into(),
                bio: None,
                photo_url: "http://insecure.example/photo.jpg".into()
            })
            .is_err()
        );
    }
}

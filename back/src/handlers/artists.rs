//! Artist catalog: creating artist profiles (admin-only today) and public
//! reads of the artist directory / an artist's detail page.

use super::util::{ensure_admin, optional_text, public_storage_url, required_text};
use crate::{
    AlbumListItem, AnyAuth, AppState, ArtistDetailResponse, ArtistResponse, ArtistSongItem,
    BSideError, Claims,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
};
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/artists",
    request_body(content = String, description = "Multipart form data with name, bio, and photo"),
    responses(
        (status = 200, description = "Artist created successfully", body = ArtistResponse),
        (status = 400, description = "Invalid form data or missing required fields"),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Artists"]
)]
pub async fn create_artist_handler(
    State(state): State<AppState>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<ArtistResponse>, BSideError> {
    let current_user_id = claims.sub;
    ensure_admin(&state, current_user_id).await?;
    let mut name: Option<String> = None;
    let mut bio: Option<String> = None;
    let mut photo_url = public_storage_url("bside-covers", "default_artist.jpg");
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| BSideError::BadRequest(e.to_string()))?
    {
        let field_name = field.name().unwrap_or("").to_string();
        match field_name.as_str() {
            "name" => {
                name = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| BSideError::BadRequest(e.to_string()))?,
                );
            }
            "bio" => {
                bio = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| BSideError::BadRequest(e.to_string()))?,
                );
            }
            "photo" => {
                let content_type = field.content_type().unwrap_or("").to_string();
                if content_type != "image/png"
                    && content_type != "image/jpeg"
                    && content_type != "image/webp"
                {
                    return Err(BSideError::BadRequest(
                        "Artist photo must be a PNG, JPEG, or WebP image.".into(),
                    ));
                }
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| BSideError::BadRequest(e.to_string()))?;
                if data.len() >= 4 {
                    let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                    let jpg_header = [0xFF, 0xD8, 0xFF];
                    let is_webp =
                        data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP";

                    let (is_valid, extension) = if data.starts_with(&png_header) {
                        (true, "png")
                    } else if data.starts_with(&jpg_header) {
                        (true, "jpg")
                    } else if is_webp {
                        (true, "webp")
                    } else {
                        (false, "")
                    };
                    if is_valid && data.len() <= 10 * 1024 * 1024 {
                        let file_id = Uuid::new_v4();
                        let key = format!("{file_id}.{extension}");

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
                        photo_url = public_storage_url("bside-covers", &key);
                    } else {
                        return Err(BSideError::BadRequest(
                            "Artist photo must be a valid PNG/JPEG/WebP under 10MB.".into(),
                        ));
                    }
                } else {
                    return Err(BSideError::BadRequest("Artist photo is invalid.".into()));
                }
            }
            _ => {}
        }
    }
    let artist_name = required_text(
        &name.ok_or_else(|| BSideError::BadRequest("Missing artist name".into()))?,
        "Artist name",
        100,
    )?;
    let bio = optional_text(bio, "Artist bio", 2_000)?;
    let mut tx = state.db.begin().await?;
    let artist_id = Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO artists (id, user_id, name, bio, photo_url, status)
        VALUES ($1, NULL, $2, $3, $4, 'Ready')"#,
        artist_id,
        artist_name,
        bio,
        photo_url
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(db_error) = &e
            && db_error.is_unique_violation()
        {
            return BSideError::Conflict("An artist with this name already exists.".into());
        }
        BSideError::SqlxError(e)
    })?;
    tx.commit().await?;
    Ok(Json(ArtistResponse {
        id: artist_id,
        user_id: None,
        name: artist_name,
        bio,
        photo_url,
        status: "Ready".to_string(),
    }))
}

#[utoipa::path(
    get,
    path = "/artists",
    responses(
        (status = 200, description = "List of artists", body = Vec<ArtistResponse>),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Artists"]
)]
pub async fn get_artists_handler(
    State(state): State<AppState>,
    _auth: AnyAuth,
) -> Result<Json<Vec<ArtistResponse>>, BSideError> {
    let artists = sqlx::query_as!(
        ArtistResponse,
        r#"SELECT
            id AS "id!",
            user_id AS "user_id?",
            name AS "name!",
            bio AS "bio?",
            photo_url AS "photo_url!",
            status AS "status!"
        FROM artists
        WHERE status = 'Ready'
        ORDER BY created_at ASC"#
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(artists))
}

#[utoipa::path(
    get,
    path = "/catalog/artists/{artist_id}",
    params(("artist_id" = uuid::Uuid, Path, description = "Artist ID")),
    responses(
        (status = 200, description = "Public artist profile", body = ArtistDetailResponse),
        (status = 404, description = "Artist not found"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Catalog"]
)]
pub async fn get_artist_by_id_handler(
    State(state): State<AppState>,
    Path(artist_id): Path<Uuid>,
    _auth: AnyAuth,
) -> Result<Json<ArtistDetailResponse>, BSideError> {
    let artist = sqlx::query_as!(
        ArtistResponse,
        r#"SELECT
            id AS "id!",
            user_id AS "user_id?",
            name AS "name!",
            bio AS "bio?",
            photo_url AS "photo_url!",
            status AS "status!"
        FROM artists
        WHERE id = $1 AND status = 'Ready'"#,
        artist_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

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
        LEFT JOIN songs s ON s.album_id = a.id AND s.status = 'Ready'
        WHERE a.artist_id = $1 AND a.status = 'Ready'
        GROUP BY a.id, ar.name
        ORDER BY a.created_at DESC
        "#,
        artist_id
    )
    .fetch_all(&state.db)
    .await?;

    let songs = sqlx::query_as!(
        ArtistSongItem,
        r#"
        SELECT
            s.id AS "id!",
            s.album_id AS "album_id!",
            a.title AS "album_title!",
            s.title AS "title!",
            s.duration_seconds AS "duration_seconds!",
            s.audio_url AS "audio_url!",
            s.status::text AS "status!",
            s.created_at AS "created_at!"
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        WHERE a.artist_id = $1 AND a.status = 'Ready' AND s.status = 'Ready'
        ORDER BY s.created_at DESC
        "#,
        artist_id
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ArtistDetailResponse {
        id: artist.id,
        user_id: artist.user_id,
        name: artist.name,
        bio: artist.bio,
        photo_url: artist.photo_url,
        status: artist.status,
        albums,
        songs,
    }))
}

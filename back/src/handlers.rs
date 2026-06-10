use crate::auth::create_jwt;
use crate::{
    AddSongResponse, AlbumDetailedResponse, AlbumListItem, AlbumResponse, AlbumSongItem, AppState,
    ArtistDetailResponse, ArtistRequestPayload, ArtistRequestResponse, ArtistRequestReviewPayload,
    ArtistResponse, ArtistSongItem, AuthRequest, AuthResponse, BSideError, Claims, ContactPayload,
    GoogleUserProfile, LoginPayload, Playlist, PlaylistDetailedResponse, PlaylistPayload,
    PlaylistSongItem, RegisterPayload, Song, SongPayload, SongResponse, UpdateStructurePayload,
    User, UserPayload,
};
use argon2::{
    Argon2, PasswordHash, PasswordVerifier,
    password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
};
use aws_sdk_s3::presigning::PresigningConfig;
use axum::{
    Json,
    extract::{Extension, Multipart, Path, State},
    response::{IntoResponse, Redirect},
};
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::authentication::Credentials,
};
use oauth2::{AuthorizationCode, CsrfToken, Scope, TokenResponse};
use reqwest::StatusCode;
use secrecy::ExposeSecret;
use std::time::Duration;
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/ping",
    responses(
        (status = 200, description = "Server health check", body = String),
    ),
    tags = ["Health"]
)]
#[axum::debug_handler]
pub async fn ping_handler() -> &'static str {
    "pong"
}

#[utoipa::path(
    post,
    path = "/contact",
    request_body = ContactPayload,
    responses(
        (status = 200, description = "Contacted successfully", body = String),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Contact"]
)]
pub async fn contact_handler(
    State(state): State<AppState>,
    Json(payload): Json<ContactPayload>,
) -> Result<impl IntoResponse, BSideError> {
    let smtp_user = std::env::var("SMTP_USERNAME")
        .map_err(|_| BSideError::InternalServerError("SMTP config missing".to_string()))?;
    let smtp_pass = std::env::var("SMTP_PASSWORD")
        .map_err(|_| BSideError::InternalServerError("SMTP config missing".to_string()))?;
    sqlx::query!(
        "INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)",
        payload.name,
        payload.email,
        payload.message
    )
    .execute(&state.db)
    .await
    .map_err(|e| BSideError::InternalServerError(e.to_string()))?;
    let email = Message::builder()
        .from(format!("BSide App <{}>", smtp_user).parse().unwrap())
        .to(smtp_user.parse().unwrap())
        .subject(format!("New B-Side contact from {}", payload.name))
        .body(format!(
            "Name: {}\nEmail: {}\nMessage: {}",
            payload.name, payload.email, payload.message
        ))
        .map_err(|e| BSideError::InternalServerError(e.to_string()))?;
    let creds = Credentials::new(smtp_user, smtp_pass);
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::relay("smtp.gmail.com")
            .unwrap()
            .credentials(creds)
            .build();
    mailer
        .send(email)
        .await
        .map_err(|e| BSideError::InternalServerError(e.to_string()))?;
    Ok(StatusCode::OK)
}

#[utoipa::path(
    post,
    path = "/register",
    request_body = RegisterPayload,
    responses(
        (status = 200, description = "User registered successfully", body = User),
        (status = 400, description = "Username or email already exists"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Authentication"]
)]
pub async fn register_handler(
    State(state): State<AppState>,
    Json(payload): Json<RegisterPayload>,
) -> Result<Json<User>, BSideError> {
    let exists: Option<bool> = Some(
        sqlx::query_scalar!(
            "SELECT EXISTS (SELECT 1  FROM users WHERE email = $1 OR username = $2)",
            payload.email,
            payload.username
        )
        .fetch_one(&state.db)
        .await?
        .unwrap_or(false),
    );
    if exists.expect("Already existent.") {
        return Err(BSideError::BadRequest(
            "Username or email already taken.".into(),
        ));
    }
    let password = payload.password.expose_secret().to_string();
    let password_hash = tokio::task::spawn_blocking(move || -> Result<String, BSideError> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        argon2
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|e| BSideError::InternalServerError(e.to_string()))
    })
    .await
    .map_err(|_| BSideError::InternalServerError("Thread panicked.".into()))??;
    let user_id = Uuid::new_v4();
    let mut tx = state.db.begin().await?;
    let new_user = sqlx::query_as!(
        User,
        r#"
        INSERT INTO users (id, username, email, role)
        VALUES($1, $2, $3, 'User')
        RETURNING id, username, email, role, created_at as "created_at!", avatar_url
        "#,
        user_id,
        payload.username,
        payload.email
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query!(
        "INSERT INTO local_credentials (user_id, password_hash) VALUES ($1, $2)",
        user_id,
        password_hash
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(new_user))
}

#[derive(utoipa::ToSchema)]
pub struct AvatarUploadSchema {
    /// The avatar image file (Must be PNG or JPEG, Max 15MB)
    #[schema(value_type = String, format = Binary)]
    pub avatar: Vec<u8>,
}
#[utoipa::path(
    post,
    path = "/users/me/avatar",
    request_body(
        content = AvatarUploadSchema,
        content_type = "multipart/form-data",
        description = "User avatar image upload"
    ),
    responses(
        (status = 200, description = "Avatar uploaded successfully", body = inline(serde_json::Value)),
        (status = 400, description = "Bad Request - Wrong format, size, or missing file"),
        (status = 401, description = "Unauthorized - Missing or invalid token"),
        (status = 500, description = "Internal Server Error - Database or S3 failure")
    ),
    security(
        ("bearer_auth" = [])
    ),
    tags = ["Authentication"]
)]
#[axum::debug_handler]
pub async fn upload_avatar(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, BSideError> {
    let mut avatar_url: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| BSideError::BadRequest(e.to_string()))?
    {
        let field_name = field.name().unwrap_or("").to_string();
        let file_id = Uuid::new_v4();
        if field_name.as_str() == "avatar" {
            let content_type = field
                .content_type()
                .expect("Content-type empty !")
                .to_string();
            let data = field
                .bytes()
                .await
                .map_err(|e| BSideError::BadRequest(e.to_string()))?;
            if data.len() > 15 * 1024 * 1024 || data.len() < 8 {
                return Err(BSideError::BadRequest("Wronge size!".into()));
            }
            let key: String;
            let ctype: String;
            let mime = content_type;
            if mime == "image/png" {
                let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                if data[0..8] != png_header {
                    return Err(BSideError::BadRequest("Incorrect format !".into()));
                }
                key = format!("{file_id}.png");
                ctype = mime;
            } else if mime == "image/jpeg" {
                let jpg_header = [0xFF, 0xD8, 0xFF];
                if data[0..3] != jpg_header {
                    return Err(BSideError::BadRequest("Incorrect format !".into()));
                }
                key = format!("{file_id}.jpg");
                ctype = mime;
            } else {
                return Err(BSideError::BadRequest(
                    "Must be PNG or JPEG format !".into(),
                ));
            }
            let avatar_bytes = data.to_vec();
            state
                .aws_client
                .put_object()
                .bucket("bside-avatars")
                .key(&key)
                .body(avatar_bytes.into())
                .content_type(ctype)
                .send()
                .await
                .map_err(|e| BSideError::S3Error(e.to_string()))?;
            avatar_url = Some(format!("http://localhost:9000/bside-avatars/{key}"));
        }
    }
    let result = sqlx::query!(
        r#"
        UPDATE users
        SET avatar_url = $2 WHERE id = $1
        "#,
        claims.sub,
        avatar_url
    )
    .execute(&state.db)
    .await
    .map_err(|e| BSideError::InternalServerError(e.to_string()))?;
    if result.rows_affected() == 0 {
        return Err(BSideError::NotFound);
    }
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "avatar_url": avatar_url})),
    ))
}

#[utoipa::path(
    get,
    path = "/login",
    request_body = LoginPayload,
    responses(
        (status = 200, description = "Login successful", body = AuthResponse),
        (status = 401, description = "Invalid credentials"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Authentication"]
)]
pub async fn classic_auth_handler(
    State(state): State<AppState>,
    axum::extract::Json(payload): axum::extract::Json<LoginPayload>,
) -> Result<Json<AuthResponse>, BSideError> {
    let password = payload.password.expose_secret().to_string();
    let user = sqlx::query!(
        r#"
        SELECT id, username, email, role, created_at as "created_at!", avatar_url, c.password_hash FROM users u INNER JOIN local_credentials c ON u.id = c.user_id WHERE u.username = $1 OR u.email=$1"#,
        payload.identifier,
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| BSideError::UnauthorizedProfile)?;
    let saved_hash_string = user.password_hash.clone();
    tokio::task::spawn_blocking(move || -> Result<(), BSideError> {
        let pw_hash = PasswordHash::new(&saved_hash_string)
            .map_err(|_| BSideError::InternalServerError("Hash Parsing has failed.".into()))?;
        let verif = Argon2::default;
        verif()
            .verify_password(password.as_bytes(), &pw_hash)
            .map_err(|_| BSideError::InternalServerError("ID error, please retry.".into()))
    })
    .await
    .map_err(|_| BSideError::InternalServerError("Thread panicked.".into()))??;
    let token = create_jwt(user.id)?;
    let user = User {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
    };

    Ok(Json(AuthResponse { user, token }))
}

#[utoipa::path(
    post,
    path = "/users",
    request_body = UserPayload,
    responses(
        (status = 200, description = "User created successfully", body = User),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
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
    // old version:
    // Extension(current_user_id): Extension<Uuid>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<ArtistResponse>, BSideError> {
    let current_user_id = claims.sub;
    ensure_admin(&state, current_user_id).await?;
    let mut name: Option<String> = None;
    let mut bio: Option<String> = None;
    let mut photo_url = "http://localhost:9000/bside-covers/default_artist.jpg".to_string();
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
                if content_type != "image/png" && content_type != "image/jpeg" {
                    continue;
                }
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| BSideError::BadRequest(e.to_string()))?;
                if data.len() >= 4 {
                    let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                    let jpg_header = [0xFF, 0xD8, 0xFF];

                    let (is_valid, extension) = if data.starts_with(&png_header) {
                        (true, "png")
                    } else if data.starts_with(&jpg_header) {
                        (true, "jpg")
                    } else {
                        (false, "")
                    };
                    if is_valid && data.len() <= 10 * 1024 * 1024 {
                        let file_id = Uuid::new_v4();
                        let key = format!("{file_id}.{extension}");
                        
                        if let Err(e) = state
                            .aws_client
                            .put_object()
                            .bucket("bside-covers")
                            .key(&key)
                            .body(data.into())
                            .content_type(content_type)
                            .send()
                            .await
                        {
                            tracing::warn!("Artist photo upload failed, using default cover: {e}");
                        } else {
                            photo_url = format!("http://localhost:9000/bside-covers/{key}");
                        }
                    }
                }
            }
            _ => {}
        }
    }
    let artist_name = name.ok_or_else(|| BSideError::BadRequest("Missing artist name".into()))?;
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
pub async fn get_public_artist_by_id_handler(
    State(state): State<AppState>,
    Path(artist_id): Path<Uuid>,
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

async fn ensure_admin(state: &AppState, user_id: Uuid) -> Result<(), BSideError> {
    let role = sqlx::query_scalar!("SELECT role FROM users WHERE id = $1", user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(BSideError::UserNotFound)?;

    if role != "Admin" {
        return Err(BSideError::UnauthorizedProfile);
    }

    Ok(())
}

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
    let artist_name = payload.artist_name.trim();
    if artist_name.is_empty() {
        return Err(BSideError::BadRequest("Artist name is required.".into()));
    }

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
        payload.bio
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
                "http://localhost:9000/bside-covers/default_artist.jpg"
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

#[utoipa::path(
    get,
    path = "/users/me",
    responses(
        (status = 200, description = "Current user data", body = User),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "User not found"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
pub async fn get_me_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<User>, BSideError> {
    let result = sqlx::query_as!(
        User,
        r#"SELECT id, username, email, role, created_at as "created_at!", avatar_url FROM users WHERE id = $1"#,
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;
    Ok(Json(result))
}

#[utoipa::path(
    get,
    path = "/users",
    responses(
        (status = 200, description = "List of all users", body = Vec<User>),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
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

#[utoipa::path(
    get,
    path = "/users/{id}",
    params(("id" = uuid::Uuid, Path, description = "User ID")),
    responses(
        (status = 200, description = "User found", body = User),
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
) -> Result<Json<User>, BSideError> {
    let user =
        sqlx::query_as::<_, User>("SELECT id, username, created_at FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(BSideError::UserNotFound)?;
    Ok(Json(user))
}

#[utoipa::path(
    post,
    path = "/albums",
    request_body(content = String, description = "Multipart form data with title, genre, and cover image"),
    responses(
        (status = 200, description = "Album created successfully", body = AlbumResponse),
        (status = 400, description = "Invalid form data or missing required fields"),
        (status = 401, description = "Unauthorized or not an artist"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn create_album_handler(
    State(state): State<AppState>,
    // old version:
    // Extension(current_user_id): Extension<uuid::Uuid>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<AlbumResponse>, BSideError> {
    let current_user_id = claims.sub;
    let artist_record = sqlx::query!("SELECT id FROM artists WHERE user_id = $1", current_user_id)
        .fetch_optional(&state.db)
        .await?;
    let artist_id = match artist_record {
        Some(record) => record.id,
        None => {
            return Err(BSideError::UnauthorizedProfile);
        }
    };
    let mut title: Option<String> = None;
    let mut genre: Option<String> = None;
    let mut cover_url = "http://localhost:9000/bside-covers/default_cover.jpg".to_string();
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
                    cover_url = format!("http://localhost:9000/bside-covers/{key}");
                }
            }
            _ => {}
        }
    }
    let title = title.ok_or_else(|| BSideError::BadRequest("Missing title".into()))?;
    let genre = genre.ok_or_else(|| BSideError::BadRequest("Missing genre".into()))?;
    let album_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO albums (id, artist_id, title, genre, cover_url, status)
        VALUES ($1, $2, $3, $4, $5, 'Ready')",
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
        status: "Ready".to_string(),
    }))
}

#[utoipa::path(
    get,
    path = "/albums",
    responses(
        (status = 200, description = "Current artist albums", body = Vec<AlbumListItem>),
        (status = 401, description = "Unauthorized or not an artist"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn get_my_albums_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<AlbumListItem>>, BSideError> {
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
        LEFT JOIN songs s ON s.album_id = a.id AND s.status != 'Deleted'
        WHERE ar.user_id = $1 AND a.status != 'Deleted'
        GROUP BY a.id, ar.name
        ORDER BY a.created_at DESC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(albums))
}

#[utoipa::path(
    get,
    path = "/catalog/albums/{album_id}",
    params(("album_id" = uuid::Uuid, Path, description = "Album ID")),
    responses(
        (status = 200, description = "Public album details with ready songs", body = AlbumDetailedResponse),
        (status = 404, description = "Album not found"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Catalog"]
)]
pub async fn get_public_album_by_id_handler(
    State(state): State<AppState>,
    Path(album_id): Path<uuid::Uuid>,
) -> Result<Json<AlbumDetailedResponse>, BSideError> {
    let album = sqlx::query!(
        r#"
        SELECT
            a.id,
            a.artist_id,
            ar.name AS "artist_name!",
            a.title,
            a.genre,
            a.cover_url,
            a.status,
            a.created_at AS "created_at!",
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', s.id,
                        'title', s.title,
                        'duration_seconds', s.duration_seconds,
                        'status', s.status,
                        'audio_url', s.audio_url,
                        'created_at', s.created_at
                    )
                    ORDER BY s.created_at ASC
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'::jsonb
            ) AS "songs!: sqlx::types::Json<Vec<AlbumSongItem>>"
        FROM albums a
        JOIN artists ar ON ar.id = a.artist_id
        LEFT JOIN songs s ON s.album_id = a.id AND s.status = 'Ready'
        WHERE a.id = $1 AND a.status = 'Ready'
        GROUP BY a.id, ar.name
        "#,
        album_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(Json(AlbumDetailedResponse {
        id: album.id,
        artist_id: album.artist_id,
        artist_name: album.artist_name,
        title: album.title,
        genre: album.genre,
        cover_url: album.cover_url,
        status: album.status,
        created_at: album.created_at,
        songs: album.songs.0,
    }))
}

#[utoipa::path(
    get,
    path = "/albums/{album_id}",
    params(("album_id" = uuid::Uuid, Path, description = "Album ID")),
    responses(
        (status = 200, description = "Album details with songs", body = AlbumDetailedResponse),
        (status = 401, description = "Unauthorized - not album owner"),
        (status = 404, description = "Album not found"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn get_album_by_id_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(album_id): Path<uuid::Uuid>,
) -> Result<Json<AlbumDetailedResponse>, BSideError> {
    let album = sqlx::query!(
        r#"
        SELECT
            a.id,
            a.artist_id,
            ar.name AS "artist_name!",
            a.title,
            a.genre,
            a.cover_url,
            a.status,
            a.created_at AS "created_at!",
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', s.id,
                        'title', s.title,
                        'duration_seconds', s.duration_seconds,
                        'status', s.status,
                        'audio_url', s.audio_url,
                        'created_at', s.created_at
                    )
                    ORDER BY s.created_at ASC
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'::jsonb
            ) AS "songs!: sqlx::types::Json<Vec<AlbumSongItem>>"
        FROM albums a
        JOIN artists ar ON ar.id = a.artist_id
        LEFT JOIN songs s ON s.album_id = a.id AND s.status != 'Deleted'
        WHERE a.id = $1 AND ar.user_id = $2 AND a.status != 'Deleted'
        GROUP BY a.id, ar.name
        "#,
        album_id,
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(Json(AlbumDetailedResponse {
        id: album.id,
        artist_id: album.artist_id,
        artist_name: album.artist_name,
        title: album.title,
        genre: album.genre,
        cover_url: album.cover_url,
        status: album.status,
        created_at: album.created_at,
        songs: album.songs.0,
    }))
}

#[utoipa::path(
    delete,
    path = "/albums/{album_id}",
    params(("album_id" = uuid::Uuid, Path, description = "Album ID")),
    responses(
        (status = 200, description = "Album queued for deletion", body = serde_json::Value),
        (status = 401, description = "Unauthorized - not album owner"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Albums"]
)]
pub async fn delete_album_handler(
    State(state): State<AppState>,
    Path(album_id): Path<uuid::Uuid>,
    axum::Extension(current_user_id): axum::Extension<Uuid>,
) -> Result<Json<serde_json::Value>, BSideError> {
    let mut tx = state.db.begin().await?;
    let album_result = sqlx::query!(
        "UPDATE albums
        SET status = 'Deleted' WHERE id = $1 AND artist_id = $2",
        album_id,
        current_user_id
    )
    .execute(&mut *tx)
    .await?;
    if album_result.rows_affected() == 0 {
        return Err(BSideError::UnauthorizedProfile);
    }
    sqlx::query!(
        "UPDATE songs
        SET status = 'Deleted' WHERE album_id = $1",
        album_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "Album and associated songs queued for deletion."
    })))
}

pub async fn flush_deleted_albums_task(state: State<AppState>) -> Result<(), BSideError> {
    let records = sqlx::query!(
        r#"SELECT a.id, a.cover_url as "cover_url!"
        FROM albums a
        LEFT JOIN songs s ON a.id = s.album_id
        WHERE a.status = 'Deleted' AND s.id IS NULL"#
    )
    .fetch_all(&state.db)
    .await?;
    let mut successfully_clean_ids: Vec<Uuid> = Vec::new();
    for record in records {
        if record.cover_url.ends_with("default_cover.jpg") {
            successfully_clean_ids.push(
                record
                    .id
                    .expect("Couldn't push ids on deleted albums task."),
            );
            continue;
        }
        if let Some(key) = record.cover_url.split('/').next_back() {
            match state
                .aws_client
                .delete_object()
                .bucket("bside-covers")
                .key(key)
                .send()
                .await
            {
                Ok(_) => {
                    successfully_clean_ids.push(
                        record
                            .id
                            .expect("Couldn't push ids on deleted albums task."),
                    );
                }
                Err(e) => {
                    eprintln!("Failed to delete cover art {key}: {e}");
                }
            }
        }
    }
    if !successfully_clean_ids.is_empty() {
        sqlx::query!(
            "DELETE FROM albums
            WHERE id = ANY($1)",
            &successfully_clean_ids
        )
        .execute(&state.db)
        .await?;
    }
    Ok(())
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
    // old version:
    // let is_owner = sqlx::query_scalar!(
    //     "SELECT EXISTS(SELECT 1 FROM albums WHERE id = $1 AND artist_id = $2)",
    //     payload.album_id,
    //     claims.sub
    // )
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
    let is_admin = sqlx::query_scalar!("SELECT role FROM users WHERE id = $1", claims.sub)
        .fetch_optional(&state.db)
        .await?
        .map(|role| role == "Admin")
        .unwrap_or(false);

    if !is_owner.unwrap_or(false) && !is_admin {
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
    // old version:
    // let is_owner = sqlx::query_scalar!(
    //     "SELECT EXISTS(SELECT 1 FROM albums WHERE id = $1 AND artist_id = $2)",
    //     song.album_id,
    //     claims.sub
    // )
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
    let is_admin = sqlx::query_scalar!("SELECT role FROM users WHERE id = $1", claims.sub)
        .fetch_optional(&state.db)
        .await?
        .map(|role| role == "Admin")
        .unwrap_or(false);
    if !is_owner && !is_admin {
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

pub async fn get_song_stream_url_handler(
    State(state): State<AppState>,
    _claims: Claims,
    Path(song_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, BSideError> {
    // old version:
    // let song = sqlx::query!(
    //     r#"
    //     SELECT s.audio_url, s.status::text as "status!"
    //     FROM songs s
    //     JOIN albums a ON s.album_id = a.id
    //     JOIN artists ar ON ar.id = a.artist_id
    //     WHERE s.id = $1 AND ar.user_id = $2
    //     "#,
    //     song_id,
    //     claims.sub
    // )
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

    let expires_in = PresigningConfig::expires_in(Duration::from_secs(300))
        .map_err(|e| BSideError::S3Error(format!("Presigning config failure: {e}")))?;

    let presigned_request = state
        .aws_client
        .get_object()
        .bucket("bside-tracks")
        .key(&song.audio_url)
        .presigned(expires_in)
        .await
        .map_err(|e| BSideError::S3Error(format!("Presigning request failure: {e}")))?;

    Ok(Json(serde_json::json!({
        "url": presigned_request.uri().to_string(),
        "expires_in": 300
    })))
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
) -> Result<axum::http::StatusCode, BSideError> {
    let mut tx = state.db.begin().await?;
    let owner = sqlx::query!(
        "SELECT a.artist_id, s.duration_seconds 
        FROM songs s
        JOIN albums a on s.album_id = a.id
        WHERE s.id = $1",
        id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(BSideError::NotFound)?;
    if owner.artist_id != claims.sub {
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

pub async fn flush_deleted_songs_task(state: AppState) -> Result<u64, BSideError> {
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
            let key = song
                .audio_url
                .split("bside-tracks/")
                .last()
                .unwrap_or(&song.audio_url);
            let obj = aws_sdk_s3::types::ObjectIdentifier::builder()
                .key(key)
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
                && let Some(c) = candidates.iter().find(|c| c.audio_url.ends_with(key))
            {
                successful_ids.push(c.id);
            }
        }
        for err in response.errors() {
            if err.code() == Some("NoSuchKey") {
                if let Some(key) = err.key()
                    && let Some(c) = candidates.iter().find(|c| c.audio_url.ends_with(key))
                {
                    successful_ids.push(c.id);
                }
            } else {
                println!(
                    "S3 Delete Error for {}: {:?}",
                    err.key().unwrap_or("Unknown"),
                    err.message()
                );
            }
        }
        if successful_ids.is_empty() {
            break;
        }
        let result = sqlx::query!("DELETE FROM songs WHERE id = ANY($1)", &successful_ids[..])
            .execute(&state.db)
            .await?;
        total_purged += result.rows_affected();
        if candidates.len() < batch_size.try_into().expect("Couldn't allocate size ?") {
            break;
        }
    }
    Ok(total_purged)
}

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
    axum::extract::Json(payload): axum::extract::Json<PlaylistPayload>,
) -> Result<Json<Playlist>, BSideError> {
    println!(
        "CREATE PLAYLIST HIT - user: {:?}, title: {:?}",
        claims.sub, payload.title
    );
    let playlist = sqlx::query_as!(
        Playlist,
        r#"
        INSERT INTO playlists (title, owner_id, is_public)
        VALUES ($1, $2, true)
        RETURNING
            id,
            title,
            owner_id,
            COALESCE(song_count, 0) as "song_count!",
            is_public as "is_public!",
            created_at as "created_at!"
        "#,
        payload.title,
        claims.sub
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
    path = "/auth/google/login",
    responses(
        (status = 302, description = "Redirect to Google OAuth login"),
    ),
    tags = ["Authentication"]
)]
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

#[utoipa::path(
    get,
    path = "/auth/google/signup",
    responses(
        (status = 302, description = "Redirect to Google OAuth signup"),
    ),
    tags = ["Authentication"]
)]
pub async fn google_signup_handler(State(state): State<AppState>) -> impl IntoResponse {
    let (auth_url, _cfrs_token) = state
        .oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_extra_param("prompt", "select_account")
        .url();
    Redirect::temporary(auth_url.as_str())
}

#[utoipa::path(
    get,
    path = "/auth/google/callback",
    params(
        ("code" = String, Query, description = "Google OAuth authorization code"),
        ("state" = String, Query, description = "CSRF state token"),
    ),
    responses(
        (status = 302, description = "Redirect to frontend with JWT token"),
        (status = 400, description = "OAuth exchange failed"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Authentication"]
)]
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
        sqlx::query!(
            "UPDATE users SET avatar_url = $1, username = $2 WHERE id = $3",
            profile.picture,
            profile.name,
            record.id
        )
        .execute(&state.db)
        .await?;
        record.id
    } else {
        println!("New use, inserting into database...");
        let new_id = uuid::Uuid::new_v4();
        sqlx::query!(
            "INSERT into users (id, email, username, avatar_url) VALUES ($1, $2, $3, $4)",
            new_id,
            profile.email,
            profile.name,
            profile.picture
        )
        .execute(&state.db)
        .await?;
        new_id
    };
    let jwt = crate::auth::create_jwt(user_id)?;
    let frontend_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:4200".to_string());
    // old version:
    // let redirect_url = format!("{frontend_url}/bside_app?token={jwt}");
    let redirect_url = format!("{frontend_url}/login?token={jwt}");
    Ok(Redirect::to(&redirect_url))
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
            created_at as "created_at!"
        FROM playlists
        WHERE owner_id = $1
        ORDER BY created_at DESC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(playlists))
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
    let mut cover_url = "http://localhost:9000/bside-covers/default_cover.jpg".to_string();

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
                    cover_url = format!("http://minio:9000/bside-covers/{key}");
                }
            }
            _ => {}
        }
    }

    let title = title.ok_or_else(|| BSideError::BadRequest("Missing title".into()))?;
    let genre = genre.ok_or_else(|| BSideError::BadRequest("Missing genre".into()))?;
    let album_id = Uuid::new_v4();

    sqlx::query!(
        "INSERT INTO albums (id, artist_id, title, genre, cover_url, status)
         VALUES ($1, $2, $3, $4, $5, 'Ready')",
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
        status: "Ready".to_string(),
    }))
}

use crate::auth::{PublicApiKey, create_jwt};
use crate::models::{
    ChatMessage, ConversationListItem, FriendListItem, FriendRequestItem, FriendRequestsResponse,
    MarkMessagesReadResponse, PlaybackInteractionType, SharedSong, SongInteractionPayload,
    UserStatusResponse,
};
use crate::{
    AddSongResponse, AlbumDetailedResponse, AlbumListItem, AlbumResponse, AlbumSongItem, AnyAuth,
    AppState, ArtistDetailResponse, ArtistRequestPayload, ArtistRequestResponse,
    ArtistRequestReviewPayload, ArtistResponse, ArtistSongItem, AuthRequest, AuthResponse,
    BSideError, Claims, ContactPayload, GoogleUserProfile, LoginPayload, MlCallbackPayload,
    Playlist, PlaylistDetailedResponse, PlaylistPayload, PlaylistSongItem, RegisterPayload, Song,
    SongPayload, SongResponse, UpdateStructurePayload, User, UserPayload,
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
    _auth: AnyAuth,
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
        r#"
        SELECT id, username, email, avatar_url, role, created_at
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
        (status = 200, description = "User found", body = User),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "User not found"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
// pub async fn get_user_by_id_handler(
//     State(state): State<AppState>,
//     Path(user_id): Path<uuid::Uuid>,
//     _claims: Claims,
// ) -> Result<Json<User>, BSideError> {
//     let user =
//         sqlx::query_as::<_, User>("SELECT id, username, created_at FROM users WHERE id = $1")
//             .bind(user_id)
//             .fetch_optional(&state.db)
//             .await?
//             .ok_or(BSideError::UserNotFound)?;
//     Ok(Json(user))
// }

pub async fn get_user_by_id_handler(
    State(state): State<AppState>,
    Path(user_id): Path<uuid::Uuid>,
    _claims: Claims,
) -> Result<Json<User>, BSideError> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, avatar_url, role, created_at
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
pub async fn get_album_by_id_handler(
    State(state): State<AppState>,
    Path(album_id): Path<uuid::Uuid>,
    _auth: AnyAuth,
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
    claims: Claims,
    Path(album_id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, BSideError> {
    let album = sqlx::query!(
        r#"
        SELECT a.cover_url, ar.user_id
        FROM albums a
        JOIN artists ar ON a.artist_id = ar.id
        WHERE a.id = $1
        "#,
        album_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;
    let is_admin = sqlx::query_scalar!("SELECT role FROM users WHERE id = $1", claims.sub)
        .fetch_optional(&state.db)
        .await?
        .map(|role| role == "Admin")
        .unwrap_or(false);
    if album.user_id != Some(claims.sub) || !is_admin {
        return Err(BSideError::UnauthorizedProfile);
    }
    let songs = sqlx::query!("SELECT audio_url FROM songs WHERE album_id = $1", album_id)
        .fetch_all(&state.db)
        .await?;
    for song in songs {
        if let Some(key) = song.audio_url.split('/').last() {
            let _ = state
                .aws_client
                .delete_object()
                .bucket("bside-tracks")
                .key(key)
                .send()
                .await;
        }
    }
    if !album.cover_url.contains("default_") {
        if let Some(key) = album.cover_url.split('/').last() {
            let _ = state
                .aws_client
                .delete_object()
                .bucket("bside-covers")
                .key(key)
                .send()
                .await;
        }
    }
    sqlx::query!("DELETE FROM albums WHERE id = $1", album_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
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

pub async fn ml_callback_handler(
    State(state): State<AppState>,
    _key: PublicApiKey,
    axum::extract::Json(payload): axum::extract::Json<MlCallbackPayload>,
) -> Result<axum::Json<serde_json::Value>, BSideError> {
    sqlx::query!(
        r#"
        UPDATE songs
        SET status = 'Ready'::song_status,
            ml_features = $2,
            normalized_vector = $3
        WHERE id = $1
        "#,
        payload.track_id,
        payload.ml_features,
        &payload.normalized_vector as &[f32]
    )
    .execute(&state.db)
    .await?;
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
    let is_admin = sqlx::query_scalar!("SELECT role FROM users WHERE id = $1", claims.sub)
        .fetch_optional(&state.db)
        .await?
        .map(|role| role == "Admin")
        .unwrap_or(false);
    if owner.artist_id != claims.sub && !is_admin {
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
    let song_record = sqlx::query!("SELECT audio_url FROM songs WHERE id = $1", id)
        .fetch_optional(&state.db)
        .await?;
    if let Some(song) = song_record {
        if let Some(key) = song.audio_url.split('/').last() {
            let _ = state
                .aws_client
                .delete_object()
                .bucket("bside-tracks")
                .key(key)
                .send()
                .await;
        }
    }
    sqlx::query!("DELETE FROM songs WHERE id = $1", id)
        .execute(&state.db)
        .await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
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
    mut multipart: Multipart,
) -> Result<Json<Playlist>, BSideError> {
    let mut title: Option<String> = None;
    let mut description: Option<String> = None;
    let mut cover_url: Option<String> = None;

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
            "description" => {
                description = Some(
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
                    continue;
                }
                let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                let (extension, content_type) = if data.starts_with(&png_header) {
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
                if data.len() > 10 * 1024 * 1024 {
                    return Err(BSideError::BadRequest(
                        "File size exceeds 10MB limit!".into(),
                    ));
                }
                let key = format!("{}.{}", Uuid::new_v4(), extension);
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
                cover_url = Some(format!("http://localhost:9000/bside-covers/{key}"));
            }
            _ => {}
        }
    }

    let title = title.ok_or_else(|| BSideError::BadRequest("Missing title".into()))?;

    let playlist = sqlx::query_as!(
        Playlist,
        r#"
        INSERT INTO playlists (title, description, owner_id, is_public, cover_url)
        VALUES ($1, $2, $3, true, $4)
        RETURNING
            id,
            title,
            owner_id,
            COALESCE(song_count, 0) as "song_count!",
            is_public as "is_public!",
            created_at as "created_at!",
            cover_url
        "#,
        title,
        description,
        claims.sub,
        cover_url,
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
    Ok(axum::http::StatusCode::NO_CONTENT)
}

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

    Ok(axum::http::StatusCode::CREATED)
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
        cover_url: playlist.cover_url,
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
            created_at as "created_at!",
            cover_url
        FROM playlists
        WHERE owner_id = $1 AND title != 'Liked Songs'
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
    path = "/messages/{other_user_id}",
    params(
        ("other_user_id" = uuid::Uuid, Path, description = "The other user ID in the conversation")
    ),
    responses(
        (status = 200, description = "Conversation messages loaded successfully", body = Vec<ChatMessage>),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    security(("Bearer" = [])),
    tags = ["Messages"]
)]
pub async fn get_conversation_messages_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(other_user_id): Path<Uuid>,
) -> Result<Json<Vec<ChatMessage>>, BSideError> {
    let current_user_id = claims.sub;

    let rows = sqlx::query!(
        r#"
        SELECT
            m.id,
            m.sender_id,
            m.receiver_id,
            m.content,
            m.message_type AS "message_type!",
            m.song_id,
            m.status,
            m.created_at,
            m.delivered_at,
            m.read_at,

            s.id AS "shared_song_id?",
            s.title AS "shared_song_title?",
            s.duration_seconds AS "shared_song_duration_seconds?",
            s.audio_url AS "shared_song_audio_url?",
            s.status::text AS "shared_song_status?",
            ar.name AS "shared_song_artist_name?",
            a.cover_url AS "shared_song_cover_url?"

        FROM messages m

        LEFT JOIN songs s
            ON s.id = m.song_id

        LEFT JOIN albums a
            ON a.id = s.album_id

        LEFT JOIN artists ar
            ON ar.id = a.artist_id

        WHERE
            (m.sender_id = $1 AND m.receiver_id = $2)
            OR
            (m.sender_id = $2 AND m.receiver_id = $1)

        ORDER BY m.created_at ASC
        "#,
        current_user_id,
        other_user_id
    )
    .fetch_all(&state.db)
    .await?;

    let messages = rows
        .into_iter()
        .map(|row| {
            let shared_song = match (
                row.shared_song_id,
                row.shared_song_title,
                row.shared_song_duration_seconds,
                row.shared_song_audio_url,
                row.shared_song_status,
                row.shared_song_artist_name,
                row.shared_song_cover_url,
            ) {
                (
                    Some(id),
                    Some(title),
                    Some(duration_seconds),
                    Some(audio_url),
                    Some(status),
                    Some(artist_name),
                    Some(cover_url),
                ) => Some(SharedSong {
                    id,
                    title,
                    duration_seconds,
                    audio_url,
                    status,
                    artist_name,
                    cover_url,
                }),

                _ => None,
            };

            ChatMessage {
                id: row.id,
                sender_id: row.sender_id,
                receiver_id: row.receiver_id,
                content: row.content,
                message_type: row.message_type,
                song_id: row.song_id,
                shared_song,
                status: row.status,
                created_at: row.created_at,
                delivered_at: row.delivered_at,
                read_at: row.read_at,
            }
        })
        .collect();

    Ok(Json(messages))
}
#[utoipa::path(
    put,
    path = "/messages/{other_user_id}/read",
    params(
        (
            "other_user_id" = Uuid,
            Path,
            description = "ID of the other user in the conversation"
        )
    ),
    responses(
        (
            status = 200,
            description = "Conversation messages marked as read",
            body = MarkMessagesReadResponse
        ),
        (
            status = 401,
            description = "Unauthorized"
        ),
        (
            status = 500,
            description = "Internal server error"
        )
    ),
    security(
        ("bearer_auth" = [])
    ),
    tags = ["Messages"]
)]
pub async fn mark_conversation_messages_as_read_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(other_user_id): Path<Uuid>,
) -> Result<Json<MarkMessagesReadResponse>, BSideError> {
    let current_user_id = claims.sub;

    let result = sqlx::query!(
        r#"
        UPDATE messages
        SET
            status = 'read',
            delivered_at = COALESCE(delivered_at, NOW()),
            read_at = NOW()
        WHERE
            sender_id = $1
            AND receiver_id = $2
            AND read_at IS NULL
        "#,
        other_user_id,
        current_user_id
    )
    .execute(&state.db)
    .await?;

    Ok(Json(MarkMessagesReadResponse {
        read_count: result.rows_affected(),
    }))
}

#[utoipa::path(
    get,
    path = "/conversations",
    responses(
        (status = 200, description = "Conversation list loaded successfully", body = Vec<ConversationListItem>),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    security(("Bearer" = [])),
    tags = ["Messages"]
)]
pub async fn get_conversations_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<ConversationListItem>>, BSideError> {
    let current_user_id = claims.sub;

    let conversations = sqlx::query_as!(
        ConversationListItem,
        r#"
        WITH user_messages AS (
            SELECT
                m.id,
                m.sender_id,
                m.receiver_id,
                CASE
                    WHEN m.message_type = 'song' THEN 'Shared a song'
                    ELSE m.content
                END AS content,
                m.status,
                m.created_at,
                CASE
                    WHEN m.sender_id = $1 THEN m.receiver_id
                    ELSE m.sender_id
                END AS other_user_id
            FROM messages m
            WHERE m.sender_id = $1 OR m.receiver_id = $1
        ),
        last_messages AS (
            SELECT DISTINCT ON (other_user_id)
                other_user_id,
                id AS last_message_id,
                sender_id AS last_sender_id,
                receiver_id AS last_receiver_id,
                content AS last_message,
                status AS last_message_status,
                created_at AS last_message_at
            FROM user_messages
            ORDER BY other_user_id, created_at DESC
        ),
        unread_counts AS (
            SELECT
                sender_id AS other_user_id,
                COUNT(*)::BIGINT AS unread_count
            FROM messages
            WHERE
                receiver_id = $1
                AND read_at IS NULL
            GROUP BY sender_id
        )
        SELECT
            u.id AS "other_user_id!",
            u.username AS "other_username!",
            u.email AS "other_email!",
            u.avatar_url AS other_avatar_url,

            lm.last_message_id AS "last_message_id!",
            lm.last_sender_id AS "last_sender_id!",
            lm.last_receiver_id AS "last_receiver_id!",
            lm.last_message AS "last_message!",
            lm.last_message_status AS "last_message_status!",
            lm.last_message_at AS "last_message_at!",

            COALESCE(uc.unread_count, 0)::BIGINT AS "unread_count!"
        FROM last_messages lm
        JOIN users u ON u.id = lm.other_user_id
        LEFT JOIN unread_counts uc ON uc.other_user_id = lm.other_user_id
        ORDER BY lm.last_message_at DESC
        "#,
        current_user_id
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(conversations))
}

pub async fn get_friends_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<FriendListItem>>, BSideError> {
    let current_user_id = claims.sub;

    let rows = sqlx::query!(
        r#"
        SELECT
            f.id AS "friendship_id!",
            u.id AS "user_id!",
            u.username AS "username!",
            u.email AS "email!",
            u.avatar_url,
            u.role AS "role!",
            f.created_at AS "friendship_created_at!"
        FROM friendships f
        JOIN users u ON u.id = CASE
            WHEN f.requester_id = $1 THEN f.addressee_id
            ELSE f.requester_id
        END
        WHERE
            (f.requester_id = $1 OR f.addressee_id = $1)
            AND f.status = 'accepted'
        ORDER BY u.username ASC
        "#,
        current_user_id
    )
    .fetch_all(&state.db)
    .await?;

    let online_users = state.network.online_users.lock().await;

    let friends = rows
        .into_iter()
        .map(|row| FriendListItem {
            friendship_id: row.friendship_id,
            user_id: row.user_id,
            username: row.username,
            email: row.email,
            avatar_url: row.avatar_url,
            role: row.role,
            is_online: online_users.contains_key(&row.user_id),
            friendship_created_at: row.friendship_created_at,
        })
        .collect();

    Ok(Json(friends))
}

pub async fn send_friend_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(target_user_id): Path<Uuid>,
) -> Result<Json<FriendRequestItem>, BSideError> {
    let current_user_id = claims.sub;

    if current_user_id == target_user_id {
        return Err(BSideError::BadRequest(
            "You cannot add yourself as a friend.".into(),
        ));
    }

    let target_exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)",
        target_user_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);

    if !target_exists {
        return Err(BSideError::UserNotFound);
    }

    let existing = sqlx::query!(
        r#"
        SELECT id, requester_id, addressee_id, status
        FROM friendships
        WHERE
            (requester_id = $1 AND addressee_id = $2)
            OR
            (requester_id = $2 AND addressee_id = $1)
        "#,
        current_user_id,
        target_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(friendship) = existing {
        if friendship.status == "accepted" {
            return Err(BSideError::Conflict("You are already friends.".into()));
        }

        if friendship.status == "pending" {
            return Err(BSideError::Conflict(
                "A friend request is already pending.".into(),
            ));
        }

        sqlx::query!(
            r#"
            UPDATE friendships
            SET requester_id = $1,
                addressee_id = $2,
                status = 'pending',
                updated_at = NOW()
            WHERE id = $3
            "#,
            current_user_id,
            target_user_id,
            friendship.id
        )
        .execute(&state.db)
        .await?;

        return fetch_friend_request_item(&state, friendship.id)
            .await
            .map(Json);
    }

    let friendship_id = Uuid::new_v4();

    sqlx::query!(
        r#"
        INSERT INTO friendships (id, requester_id, addressee_id, status)
        VALUES ($1, $2, $3, 'pending')
        "#,
        friendship_id,
        current_user_id,
        target_user_id
    )
    .execute(&state.db)
    .await?;

    fetch_friend_request_item(&state, friendship_id)
        .await
        .map(Json)
}

pub async fn get_friend_requests_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<FriendRequestsResponse>, BSideError> {
    let current_user_id = claims.sub;

    let requests = sqlx::query_as!(
        FriendRequestItem,
        r#"
        SELECT
            f.id AS "friendship_id!",
            f.requester_id AS "requester_id!",
            requester.username AS "requester_username!",
            requester.avatar_url AS requester_avatar_url,

            f.addressee_id AS "addressee_id!",
            addressee.username AS "addressee_username!",
            addressee.avatar_url AS addressee_avatar_url,

            f.status AS "status!",
            f.created_at AS "created_at!"
        FROM friendships f
        JOIN users requester ON requester.id = f.requester_id
        JOIN users addressee ON addressee.id = f.addressee_id
        WHERE
            f.status = 'pending'
            AND (f.requester_id = $1 OR f.addressee_id = $1)
        ORDER BY f.created_at DESC
        "#,
        current_user_id
    )
    .fetch_all(&state.db)
    .await?;

    let mut incoming = Vec::new();
    let mut outgoing = Vec::new();

    for request in requests {
        if request.addressee_id == current_user_id {
            incoming.push(request);
        } else {
            outgoing.push(request);
        }
    }

    Ok(Json(FriendRequestsResponse { incoming, outgoing }))
}

pub async fn accept_friend_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(friendship_id): Path<Uuid>,
) -> Result<Json<FriendRequestItem>, BSideError> {
    let current_user_id = claims.sub;

    let updated = sqlx::query!(
        r#"
        UPDATE friendships
        SET status = 'accepted',
            updated_at = NOW()
        WHERE
            id = $1
            AND addressee_id = $2
            AND status = 'pending'
        RETURNING id
        "#,
        friendship_id,
        current_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if updated.is_none() {
        return Err(BSideError::NotFound);
    }

    fetch_friend_request_item(&state, friendship_id)
        .await
        .map(Json)
}

pub async fn reject_friend_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(friendship_id): Path<Uuid>,
) -> Result<Json<FriendRequestItem>, BSideError> {
    let current_user_id = claims.sub;

    let updated = sqlx::query!(
        r#"
        UPDATE friendships
        SET status = 'rejected',
            updated_at = NOW()
        WHERE
            id = $1
            AND addressee_id = $2
            AND status = 'pending'
        RETURNING id
        "#,
        friendship_id,
        current_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if updated.is_none() {
        return Err(BSideError::NotFound);
    }

    fetch_friend_request_item(&state, friendship_id)
        .await
        .map(Json)
}

pub async fn remove_friend_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(other_user_id): Path<Uuid>,
) -> Result<impl IntoResponse, BSideError> {
    let current_user_id = claims.sub;

    let deleted = sqlx::query!(
        r#"
        DELETE FROM friendships
        WHERE
            (requester_id = $1 AND addressee_id = $2)
            OR
            (requester_id = $2 AND addressee_id = $1)
        RETURNING id
        "#,
        current_user_id,
        other_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if deleted.is_none() {
        return Err(BSideError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_user_status_handler(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    _claims: Claims,
) -> Result<Json<UserStatusResponse>, BSideError> {
    let user_exists =
        sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", user_id)
            .fetch_one(&state.db)
            .await?
            .unwrap_or(false);

    if !user_exists {
        return Err(BSideError::UserNotFound);
    }

    let online_users = state.network.online_users.lock().await;

    Ok(Json(UserStatusResponse {
        user_id,
        is_online: online_users.contains_key(&user_id),
    }))
}

async fn fetch_friend_request_item(
    state: &AppState,
    friendship_id: Uuid,
) -> Result<FriendRequestItem, BSideError> {
    let request = sqlx::query_as!(
        FriendRequestItem,
        r#"
        SELECT
            f.id AS "friendship_id!",
            f.requester_id AS "requester_id!",
            requester.username AS "requester_username!",
            requester.avatar_url AS requester_avatar_url,

            f.addressee_id AS "addressee_id!",
            addressee.username AS "addressee_username!",
            addressee.avatar_url AS addressee_avatar_url,

            f.status AS "status!",
            f.created_at AS "created_at!"
        FROM friendships f
        JOIN users requester ON requester.id = f.requester_id
        JOIN users addressee ON addressee.id = f.addressee_id
        WHERE f.id = $1
        "#,
        friendship_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(request)
}

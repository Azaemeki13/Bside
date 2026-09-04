//! Account lifecycle: registration, classic + Google OAuth login, avatar
//! upload, and profile self-service ("/users/me").

use super::util::{public_storage_url, valid_email};
use crate::auth::create_jwt;
use crate::models::UpdateProfilePayload;
use crate::{
    AppState, AuthRequest, AuthResponse, BSideError, Claims, GoogleUserProfile, LoginPayload,
    RegisterPayload, User,
};
use argon2::{
    Argon2, PasswordHash, PasswordVerifier,
    password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
};
use axum::{
    Json,
    extract::{Multipart, State},
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Redirect, Response},
};
use oauth2::{AuthorizationCode, CsrfToken, Scope, TokenResponse};
use reqwest::StatusCode;
use secrecy::ExposeSecret;
use uuid::Uuid;

fn validate_registration(username: &str, email: &str, password: &str) -> Result<(), BSideError> {
    if !(3..=30).contains(&username.len())
        || !username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(BSideError::BadRequest(
            "Username must be 3-30 characters using letters, numbers, '_' or '-'.".into(),
        ));
    }
    if !valid_email(email) {
        return Err(BSideError::BadRequest(
            "A valid email address is required.".into(),
        ));
    }
    if !(8..=128).contains(&password.chars().count())
        || !password.bytes().any(|byte| byte.is_ascii_lowercase())
        || !password.bytes().any(|byte| byte.is_ascii_uppercase())
        || !password.bytes().any(|byte| byte.is_ascii_digit())
    {
        return Err(BSideError::BadRequest(
            "Password must be 8-128 characters and include uppercase, lowercase, and a number."
                .into(),
        ));
    }
    Ok(())
}

fn oauth_state_cookie(state: &str) -> Result<HeaderValue, BSideError> {
    HeaderValue::from_str(&format!(
        "bside_oauth_state={state}; Path=/api/auth/google/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax"
    ))
    .map_err(|_| BSideError::AuthError("Failed to create OAuth state cookie.".into()))
}

fn oauth_redirect_with_state(auth_url: &str, csrf_state: &str) -> Result<Response, BSideError> {
    let mut response = Redirect::temporary(auth_url).into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, oauth_state_cookie(csrf_state)?);
    Ok(response)
}

fn clear_oauth_state_cookie(response: &mut Response) {
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "bside_oauth_state=; Path=/api/auth/google/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
        ),
    );
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.bytes()
        .zip(right.bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn oauth_state_from_cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|cookie| cookie.strip_prefix("bside_oauth_state="))
}

#[utoipa::path(
    post,
    path = "/register",
    request_body = RegisterPayload,
    responses(
        (status = 200, description = "User registered successfully", body = User),
        (status = 400, description = "Invalid registration fields or username/email already exists"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Authentication"]
)]
pub async fn register_handler(
    State(state): State<AppState>,
    Json(payload): Json<RegisterPayload>,
) -> Result<Json<User>, BSideError> {
    let username = payload.username.trim().to_string();
    let email = payload.email.trim().to_ascii_lowercase();
    validate_registration(&username, &email, payload.password.expose_secret())?;
    let exists: Option<bool> = Some(
        sqlx::query_scalar!(
            "SELECT EXISTS (SELECT 1  FROM users WHERE email = $1 OR username = $2)",
            email,
            username
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
        RETURNING id, username, display_name, email, role, is_banned, created_at as "created_at!", avatar_url
        "#,
        user_id,
        username,
        email
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
    claims: Claims,
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
                .ok_or_else(|| BSideError::BadRequest("Avatar Content-Type is required.".into()))?
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
            avatar_url = Some(public_storage_url("bside-avatars", &key));
        }
    }
    if avatar_url.is_none() {
        return Err(BSideError::BadRequest("An avatar file is required.".into()));
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
    patch,
    path = "/users/me",
    request_body = UpdateProfilePayload,
    responses(
        (status = 200, description = "Profile updated successfully", body = User),
        (status = 400, description = "Bad Request - Display name too long"),
        (status = 401, description = "Unauthorized - Missing or invalid token"),
    ),
    security(
        ("bearer_auth" = [])
    ),
    tags = ["Authentication"]
)]
pub async fn update_profile_handler(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<User>, BSideError> {
    let trimmed = payload.display_name.trim();

    if trimmed.chars().count() > 50 {
        return Err(BSideError::BadRequest(
            "Display name must be 50 characters or fewer.".into(),
        ));
    }

    let display_name = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    };

    let user = sqlx::query_as!(
        User,
        r#"
        UPDATE users
        SET display_name = $2
        WHERE id = $1
        RETURNING id, username, display_name, email, avatar_url, role, is_banned, created_at as "created_at!"
        "#,
        claims.sub,
        display_name
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;

    Ok(Json(user))
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
    let trimmed_identifier = payload.identifier.trim();
    let identifier = if trimmed_identifier.contains('@') {
        trimmed_identifier.to_ascii_lowercase()
    } else {
        trimmed_identifier.to_string()
    };
    let password = payload.password.expose_secret().to_string();
    if identifier.is_empty()
        || identifier.chars().count() > 254
        || password.is_empty()
        || password.chars().count() > 128
    {
        return Err(BSideError::AuthError("Invalid credentials".into()));
    }
    let user = sqlx::query!(
        r#"
        SELECT id, username, display_name, email, role, is_banned, created_at as "created_at!", avatar_url, c.password_hash FROM users u INNER JOIN local_credentials c ON u.id = c.user_id WHERE u.username = $1 OR u.email=$1"#,
        identifier,
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| BSideError::AuthError("Invalid credentials".into()))?;

    if user.is_banned {
        return Err(BSideError::Banned);
    }

    let saved_hash_string = user.password_hash.clone();
    tokio::task::spawn_blocking(move || -> Result<(), BSideError> {
        let pw_hash = PasswordHash::new(&saved_hash_string)
            .map_err(|_| BSideError::InternalServerError("Hash Parsing has failed.".into()))?;
        let verif = Argon2::default;
        verif()
            .verify_password(password.as_bytes(), &pw_hash)
            .map_err(|_| BSideError::AuthError("Invalid credentials".into()))
    })
    .await
    .map_err(|_| BSideError::InternalServerError("Thread panicked.".into()))??;
    let token = create_jwt(user.id)?;
    let user = User {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        is_banned: user.is_banned,
        created_at: user.created_at,
    };

    Ok(Json(AuthResponse { user, token }))
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
        r#"SELECT id, username, display_name, email, role, is_banned, created_at as "created_at!", avatar_url FROM users WHERE id = $1"#,
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::UserNotFound)?;
    Ok(Json(result))
}

#[utoipa::path(
    get,
    path = "/auth/google/login",
    responses(
        (status = 302, description = "Redirect to Google OAuth login"),
    ),
    tags = ["Authentication"]
)]
pub async fn google_login_handler(State(state): State<AppState>) -> Result<Response, BSideError> {
    let (auth_url, csrf_token) = state
        .oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .url();
    oauth_redirect_with_state(auth_url.as_str(), csrf_token.secret())
}

#[utoipa::path(
    get,
    path = "/auth/google/signup",
    responses(
        (status = 302, description = "Redirect to Google OAuth signup"),
    ),
    tags = ["Authentication"]
)]
pub async fn google_signup_handler(State(state): State<AppState>) -> Result<Response, BSideError> {
    let (auth_url, csrf_token) = state
        .oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_extra_param("prompt", "select_account")
        .url();
    oauth_redirect_with_state(auth_url.as_str(), csrf_token.secret())
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
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<AuthRequest>,
) -> Result<Response, BSideError> {
    let expected_state = oauth_state_from_cookie(&headers)
        .ok_or_else(|| BSideError::AuthError("Missing OAuth state cookie.".into()))?;
    if !constant_time_equal(expected_state, &query.state) {
        return Err(BSideError::AuthError("Invalid OAuth state.".into()));
    }
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
    if !profile.verified_email {
        return Err(BSideError::AuthError(
            "Google account email must be verified.".into(),
        ));
    }
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

    let frontend_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "https://localhost".to_string());

    let is_banned = sqlx::query_scalar!("SELECT is_banned FROM users WHERE id = $1", user_id)
        .fetch_one(&state.db)
        .await?;

    if is_banned {
        let redirect_url = format!("{frontend_url}/login?error=banned");
        let mut response = Redirect::to(&redirect_url).into_response();
        clear_oauth_state_cookie(&mut response);
        return Ok(response);
    }

    let jwt = create_jwt(user_id)?;
    let redirect_url = format!("{frontend_url}/login#token={jwt}");
    let mut response = Redirect::to(&redirect_url).into_response();
    clear_oauth_state_cookie(&mut response);
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registration_accepts_expected_values() {
        assert!(validate_registration("music_fan-42", "fan@example.com", "Password123").is_ok());
    }

    #[test]
    fn registration_rejects_invalid_fields() {
        assert!(validate_registration("a!", "fan@example.com", "Password123").is_err());
        assert!(validate_registration("musicfan", "not-an-email", "Password123").is_err());
        assert!(validate_registration("musicfan", "a@b@c.com", "Password123").is_err());
        assert!(validate_registration("musicfan", "fan@example.com", "password").is_err());
    }
}

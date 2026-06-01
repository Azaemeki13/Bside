use crate::{AppState, BSideError};
use axum::{
    extract::{FromRef, FromRequestParts, Request},
    http::{StatusCode, request::Parts},
    middleware::Next,
    response::Response,
};
use secrecy::ExposeSecret;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use uuid::Uuid;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

pub async fn bootstrap_admin(
    pool: &sqlx::PgPool
) -> Result<(), BSideError> {
    let admin_email = std::env::var("ADMIN_EMAIL").ok();
    let admin_username = std::env::var("ADMIN_USERNAME").ok();
    let admin_password = std::env::var("ADMIN_PASSWORD").ok();
    if let (Some(email), Some(username), Some(password)) = (admin_email, admin_username, admin_password) {
        let exists = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)",
            email
        )
        .fetch_one(pool)
        .await?
        .unwrap_or(false);
        if !exists {
            println!("Bootstrapping initial Admin account...");
            let password_hash_task = tokio::task::spawn_blocking(move || -> Result<String, BSideError> {
                let salt = SaltString::generate(&mut OsRng);
                let argon2 = Argon2::default();
                argon2.hash_password(password.as_bytes(), &salt)
                    .map(|hash| hash.to_string())
                    .map_err(|e| BSideError::InternalServerError(e.to_string()))
            })
            .await
            .map_err(|_| BSideError::InternalServerError("Thread panicked".into()))?;
            let password_hash = password_hash_task?;
            let admin_id = Uuid::new_v4();
            let mut tx = pool.begin().await?;
            sqlx::query!(
                "INSERT INTO users (id, username, email, role) VALUES ($1, $2, $3, 'Admin')",
                admin_id, username, email
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!(
                "INSERT INTO local_credentials (user_id, password_hash) VALUES ($1, $2)",
            admin_id, password_hash
            )
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            println!("Admin account '{username}' successfully created !");
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: uuid::Uuid,
    pub exp: usize,
}

pub fn create_jwt(user_id: uuid::Uuid) -> Result<String, BSideError> {
    let expiration = usize::try_from(
        chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(24))
            .expect("Valid timestamp")
            .timestamp(),
    );

    let claims = Claims {
        sub: user_id,
        exp: expiration?,
    };
    let secret = std::env::var("JWT_SECRET").expect("JWT secret must be set");

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| BSideError::AuthError(format!("JWT enconding failed: {e}")))?;
    Ok(token)
}

impl<S> FromRequestParts<S> for Claims
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = StatusCode;
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "));
        let token = auth_header.ok_or(StatusCode::UNAUTHORIZED)?;
        let token_data = decode::<Self>(
            token,
            &DecodingKey::from_secret(app_state.jwt.expose_secret().as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
        Ok(token_data.claims)
    }
}

pub async fn auth_gate(_claims: Claims, request: Request, next: Next) -> Response {
    next.run(request).await
}

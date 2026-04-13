use crate::{AppState, BSideError};
use axum::{
    extract::{FromRef, FromRequestParts},
    http::{StatusCode, request::Parts},
};
use secrecy::ExposeSecret;

use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
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

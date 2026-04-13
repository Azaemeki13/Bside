use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BSideError {
    #[error("Profile not found or ownership denied.")]
    UnauthorizedProfile,
    #[error("Invalid media format: only wav/flac allowed.")]
    InvalidFormat,
    #[error("File too large, 200 MB limit.")]
    PayloadTooLarge,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Database failure: {0}.")]
    SqlxError(#[from] sqlx::Error),
    #[error("S3 failure: {0}.")]
    S3Error(String),
    #[error("The requested resource was not found.")]
    NotFound,
    #[error("User not found.")]
    UserNotFound,
    #[error("Authentication failed: {0}.")]
    AuthError(String),
    #[error("Request failed: {0}")]
    NetworkError(#[from] reqwest::Error),
    #[error("Integer conversion failed: {0}")]
    ConversionError(#[from] std::num::TryFromIntError),
    #[error("Conflict: {0}")]
    Conflict(String),
}

impl IntoResponse for BSideError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            Self::InvalidFormat => (StatusCode::BAD_REQUEST, self.to_string()),
            Self::BadRequest(ref msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            Self::Conflict(ref msg) => (StatusCode::CONFLICT, msg.clone()),
            Self::AuthError(ref msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            Self::UnauthorizedProfile => (StatusCode::FORBIDDEN, self.to_string()),
            Self::NotFound | Self::UserNotFound => (StatusCode::NOT_FOUND, self.to_string()),
            Self::PayloadTooLarge => (StatusCode::PAYLOAD_TOO_LARGE, self.to_string()),
            Self::SqlxError(ref e) => {
                tracing::error!("Database error occurred: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal server error occurred.".to_string(),
                )
            }
            Self::S3Error(_) | Self::NetworkError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "An internal server error occurred.".to_string(),
            ),
            Self::ConversionError(e) => {
                tracing::error!("Type conversion failed: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "A technical error occurred.".to_string(),
                )
            }
        };
        (status, error_message).into_response()
    }
}

//! Standalone endpoints that don't belong to a bigger domain: health check
//! and the public contact form.

use super::util::valid_email;
use crate::{AnyAuth, AppState, BSideError, ContactPayload};
use axum::{Json, extract::State, response::IntoResponse};
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::authentication::Credentials,
};
use reqwest::StatusCode;

fn validate_contact(name: &str, email: &str, message: &str) -> Result<(), BSideError> {
    if !(1..=100).contains(&name.chars().count()) {
        return Err(BSideError::BadRequest(
            "Name must be 1-100 characters.".into(),
        ));
    }
    if !valid_email(email) {
        return Err(BSideError::BadRequest(
            "A valid email address is required.".into(),
        ));
    }
    if !(10..=5_000).contains(&message.chars().count()) {
        return Err(BSideError::BadRequest(
            "Message must be 10-5000 characters.".into(),
        ));
    }
    Ok(())
}

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
        (status = 400, description = "Invalid name, email, or message"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Contact"]
)]
pub async fn contact_handler(
    State(state): State<AppState>,
    _auth: AnyAuth,
    Json(payload): Json<ContactPayload>,
) -> Result<impl IntoResponse, BSideError> {
    let name = payload.name.trim();
    let email_address = payload.email.trim().to_ascii_lowercase();
    let message = payload.message.trim();
    validate_contact(name, &email_address, message)?;
    let smtp_user = std::env::var("SMTP_USERNAME")
        .map_err(|_| BSideError::InternalServerError("SMTP config missing".to_string()))?;
    let smtp_pass = std::env::var("SMTP_PASSWORD")
        .map_err(|_| BSideError::InternalServerError("SMTP config missing".to_string()))?;
    sqlx::query!(
        "INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)",
        name,
        email_address,
        message
    )
    .execute(&state.db)
    .await
    .map_err(|e| BSideError::InternalServerError(e.to_string()))?;
    let email = Message::builder()
        .from(format!("BSide App <{}>", smtp_user).parse().unwrap())
        .to(smtp_user.parse().unwrap())
        .subject(format!("New B-Side contact from {name}"))
        .body(format!(
            "Name: {}\nEmail: {}\nMessage: {}",
            name, email_address, message
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contact_enforces_email_and_bounds() {
        assert!(validate_contact("Listener", "fan@example.com", "A useful message").is_ok());
        assert!(validate_contact("", "fan@example.com", "A useful message").is_err());
        assert!(validate_contact("Listener", "invalid", "A useful message").is_err());
        assert!(validate_contact("Listener", "fan@example.com", "short").is_err());
        assert!(validate_contact("é", "fan@example.com", &"🎵".repeat(10)).is_ok());
    }
}

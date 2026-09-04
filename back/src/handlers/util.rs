//! Small helpers shared by several handler modules: input validation,
//! public storage URL building, and role/permission checks.

use crate::{AppState, BSideError};
use uuid::Uuid;

pub fn public_storage_url(bucket: &str, key: &str) -> String {
    let endpoint = std::env::var("AWS_PUBLIC_ENDPOINT_URL")
        .unwrap_or_else(|_| "https://localhost".to_string());
    format!("{}/{bucket}/{key}", endpoint.trim_end_matches('/'))
}

pub fn valid_email(value: &str) -> bool {
    if value.is_empty() || value.len() > 254 || value.bytes().any(|byte| byte.is_ascii_whitespace())
    {
        return false;
    }
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && local.len() <= 64
        && domain.contains('.')
        && !domain.contains('@')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

pub fn required_text(value: &str, field: &str, max: usize) -> Result<String, BSideError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(BSideError::BadRequest(format!(
            "{field} must be 1-{max} characters."
        )));
    }
    Ok(value.to_string())
}

pub fn optional_text(
    value: Option<String>,
    field: &str,
    max: usize,
) -> Result<Option<String>, BSideError> {
    value
        .map(|value| {
            let value = value.trim();
            if value.chars().count() > max {
                return Err(BSideError::BadRequest(format!(
                    "{field} must not exceed {max} characters."
                )));
            }
            Ok((!value.is_empty()).then(|| value.to_string()))
        })
        .transpose()
        .map(Option::flatten)
}

pub fn validate_ml_json(value: &serde_json::Value, field: &str) -> Result<(), BSideError> {
    if !value.is_object() {
        return Err(BSideError::BadRequest(format!(
            "{field} must be a JSON object."
        )));
    }
    let encoded = serde_json::to_vec(value)
        .map_err(|_| BSideError::BadRequest(format!("{field} is invalid.")))?;
    if encoded.len() > 32 * 1024 {
        return Err(BSideError::BadRequest(format!(
            "{field} must not exceed 32KB."
        )));
    }
    Ok(())
}

pub fn validate_genre(value: &str) -> Result<String, BSideError> {
    const GENRES: [&str; 19] = [
        "Hip-Hop",
        "Jazz",
        "Indie",
        "Electronic",
        "Pop",
        "Classical",
        "Metal",
        "R&B",
        "Country",
        "Reggae",
        "Blues",
        "Folk",
        "Punk",
        "Soul",
        "Funk",
        "Disco",
        "Gospel",
        "Latin",
        "World",
    ];
    let value = value.trim();
    if !GENRES.contains(&value) {
        return Err(BSideError::BadRequest("Unsupported album genre.".into()));
    }
    Ok(value.to_string())
}

pub async fn user_role(state: &AppState, user_id: Uuid) -> Result<Option<String>, BSideError> {
    Ok(
        sqlx::query_scalar!("SELECT role FROM users WHERE id = $1", user_id)
            .fetch_optional(&state.db)
            .await?,
    )
}

pub async fn is_admin(state: &AppState, user_id: Uuid) -> Result<bool, BSideError> {
    Ok(user_role(state, user_id).await?.as_deref() == Some("Admin"))
}

pub async fn is_admin_or_moderator(state: &AppState, user_id: Uuid) -> Result<bool, BSideError> {
    Ok(matches!(
        user_role(state, user_id).await?.as_deref(),
        Some("Admin") | Some("Moderator")
    ))
}

pub async fn ensure_admin(state: &AppState, user_id: Uuid) -> Result<(), BSideError> {
    if !is_admin(state, user_id).await? {
        return Err(BSideError::UnauthorizedProfile);
    }
    Ok(())
}

pub async fn ensure_admin_or_moderator(state: &AppState, user_id: Uuid) -> Result<(), BSideError> {
    if !is_admin_or_moderator(state, user_id).await? {
        return Err(BSideError::UnauthorizedProfile);
    }
    Ok(())
}

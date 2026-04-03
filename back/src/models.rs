#[derive(serde::Serialize)]
pub struct PingResponse
{
    pub status: String,
    pub message: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct User
{
    pub id: uuid::Uuid,
    pub username: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct UserPayload
{
    pub username: String,
}

//! Per-user listening analytics: aggregate stats, recently played songs, and
//! the artists a user has spent the most time on in the last 30 days.

use crate::{
    AppState, BSideError, Claims, DailyActivityStat, RecentPlayItem, TopSongStat, TopSpinItem,
    UserActivityAnalytics,
};
use axum::{
    Json,
    extract::{Query, State},
};

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct LimitParams {
    pub limit: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/users/me/analytics",
    responses(
        (status = 200, description = "Current user's activity analytics", body = UserActivityAnalytics),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
pub async fn get_user_activity_analytics_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<UserActivityAnalytics>, BSideError> {
    let totals = sqlx::query!(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE interaction_type IN ('play', 'replay')) AS "total_plays!",
            COALESCE(SUM(listened_seconds) FILTER (WHERE interaction_type IN ('play', 'replay', 'complete')), 0)::BIGINT AS "total_listened_seconds!",
            COUNT(*) FILTER (WHERE interaction_type = 'like') AS "total_likes!",
            COUNT(DISTINCT song_id) FILTER (WHERE interaction_type IN ('play', 'replay')) AS "unique_songs_played!"
        FROM user_song_interactions
        WHERE user_id = $1
        "#,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    let top_songs = sqlx::query_as!(
        TopSongStat,
        r#"
        SELECT s.id AS "song_id!", s.title AS "title!", COUNT(*) AS "play_count!"
        FROM user_song_interactions i
        JOIN songs s ON s.id = i.song_id
        WHERE i.user_id = $1 AND i.interaction_type IN ('play', 'replay')
        GROUP BY s.id, s.title
        ORDER BY "play_count!" DESC
        LIMIT 5
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    let daily_activity = sqlx::query_as!(
        DailyActivityStat,
        r#"
        SELECT
            created_at::DATE AS "day!",
            COUNT(*) FILTER (WHERE interaction_type IN ('play', 'replay')) AS "play_count!",
            COALESCE(SUM(listened_seconds) FILTER (WHERE interaction_type IN ('play', 'replay', 'complete')), 0)::BIGINT AS "listened_seconds!"
        FROM user_song_interactions
        WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY created_at::DATE
        ORDER BY "day!" ASC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(UserActivityAnalytics {
        total_plays: totals.total_plays,
        total_listened_seconds: totals.total_listened_seconds,
        total_likes: totals.total_likes,
        unique_songs_played: totals.unique_songs_played,
        top_songs,
        daily_activity,
    }))
}

#[utoipa::path(
    get,
    path = "/users/me/recent-plays",
    params(("limit" = Option<i64>, Query, description = "Max songs to return (default 4, max 20)")),
    responses(
        (status = 200, description = "The user's most recently played songs, most recent first", body = Vec<RecentPlayItem>),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
pub async fn get_recent_plays_handler(
    State(state): State<AppState>,
    Query(params): Query<LimitParams>,
    claims: Claims,
) -> Result<Json<Vec<RecentPlayItem>>, BSideError> {
    let limit = params.limit.unwrap_or(4);
    if !(1..=20).contains(&limit) {
        return Err(BSideError::BadRequest(
            "limit must be between 1 and 20.".into(),
        ));
    }

    let items = sqlx::query_as!(
        RecentPlayItem,
        r#"
        SELECT
            s.id AS song_id,
            s.title,
            s.audio_url,
            a.artist_id,
            ar.name AS "artist_name!",
            a.id AS album_id,
            a.cover_url,
            latest.last_played_at AS "last_played_at!"
        FROM (
            SELECT song_id, MAX(created_at) AS last_played_at
            FROM user_song_interactions
            WHERE user_id = $1 AND interaction_type IN ('play', 'replay', 'complete')
            GROUP BY song_id
        ) latest
        JOIN songs s ON s.id = latest.song_id
        JOIN albums a ON a.id = s.album_id
        JOIN artists ar ON ar.id = a.artist_id
        WHERE s.status = 'Ready'
        ORDER BY latest.last_played_at DESC
        LIMIT $2
        "#,
        claims.sub,
        limit
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(items))
}

#[utoipa::path(
    get,
    path = "/users/me/top-spins",
    params(("limit" = Option<i64>, Query, description = "Max artists to return (default 6, max 20)")),
    responses(
        (status = 200, description = "The user's most-listened artists over the last 30 days, ranked by total listened time", body = Vec<TopSpinItem>),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error"),
    ),
    security(("Bearer" = [])),
    tags = ["Users"]
)]
pub async fn get_top_spins_handler(
    State(state): State<AppState>,
    Query(params): Query<LimitParams>,
    claims: Claims,
) -> Result<Json<Vec<TopSpinItem>>, BSideError> {
    let limit = params.limit.unwrap_or(6);
    if !(1..=20).contains(&limit) {
        return Err(BSideError::BadRequest(
            "limit must be between 1 and 20.".into(),
        ));
    }

    let items = sqlx::query_as!(
        TopSpinItem,
        r#"
        SELECT
            ar.id AS artist_id,
            ar.name AS artist_name,
            ar.photo_url,
            COALESCE(SUM(i.listened_seconds) FILTER (WHERE i.interaction_type IN ('complete', 'skip')), 0)::BIGINT AS "listened_seconds!"
        FROM user_song_interactions i
        JOIN songs s ON s.id = i.song_id
        JOIN albums a ON a.id = s.album_id
        JOIN artists ar ON ar.id = a.artist_id
        WHERE i.user_id = $1 AND i.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY ar.id, ar.name, ar.photo_url
        HAVING COALESCE(SUM(i.listened_seconds) FILTER (WHERE i.interaction_type IN ('complete', 'skip')), 0) > 0
        ORDER BY "listened_seconds!" DESC
        LIMIT $2
        "#,
        claims.sub,
        limit
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(items))
}

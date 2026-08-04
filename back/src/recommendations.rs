use crate::models::AlbumListItem;
use crate::preferences::load_user_liked_song_ids;
use crate::{AnyAuth, AppState, BSideError};
use axum::Json;
use axum::extract::{Query, State};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

pub const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 50;
const FALLBACK_LIMIT_USIZE: usize = 20;

struct SongCandidate {
    album_id: Uuid,
    normalized_vector: Vec<f32>,
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a = a.iter().map(|value| value * value).sum::<f32>().sqrt();
    let norm_b = b.iter().map(|value| value * value).sum::<f32>().sqrt();

    if norm_a <= f32::EPSILON || norm_b <= f32::EPSILON {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

async fn load_candidate_songs(
    db: &PgPool,
    genre: Option<&str>,
    exclude_song_ids: &[Uuid],
) -> Result<Vec<SongCandidate>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT
            a.id AS album_id,
            s.normalized_vector AS "normalized_vector!: Vec<f32>"
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        WHERE s.status = 'Ready'
          AND a.status = 'Ready'
          AND s.normalized_vector IS NOT NULL
          AND ($1::text IS NULL OR a.genre = $1)
          AND NOT (s.id = ANY($2::uuid[]))
        "#,
        genre,
        exclude_song_ids
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SongCandidate {
            album_id: row.album_id,
            normalized_vector: row.normalized_vector,
        })
        .collect())
}

async fn load_albums_by_ids(
    db: &PgPool,
    album_ids: &[Uuid],
) -> Result<Vec<AlbumListItem>, sqlx::Error> {
    if album_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as!(
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
        WHERE a.id = ANY($1::uuid[]) AND a.status = 'Ready'
        GROUP BY a.id, ar.name
        "#,
        album_ids
    )
    .fetch_all(db)
    .await
}

async fn load_freshest_albums(
    db: &PgPool,
    genre: Option<&str>,
    limit: i64,
) -> Result<Vec<AlbumListItem>, sqlx::Error> {
    sqlx::query_as!(
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
        WHERE a.status = 'Ready' AND ($1::text IS NULL OR a.genre = $1)
        GROUP BY a.id, ar.name
        HAVING COUNT(s.id) > 0
        ORDER BY a.created_at DESC
        LIMIT $2
        "#,
        genre,
        limit
    )
    .fetch_all(db)
    .await
}

/// Personalized "fresh picks": ranks albums by the cosine similarity between
/// the user's preference vector (built from their like/play/skip history, see
/// `preferences.rs`) and each candidate song's audio feature vector, keeping
/// each album's best-matching song as its score and excluding songs already
/// in the user's Liked Songs.
///
/// Falls back to the most recently released catalog (optionally filtered by
/// genre) when there's no user, no preference vector yet (new account with no
/// interaction history), or no scored candidates (e.g. an empty genre).
pub async fn get_fresh_picks(
    db: &PgPool,
    user_id: Option<Uuid>,
    genre: Option<&str>,
    limit: Option<i64>,
) -> Result<Vec<AlbumListItem>, sqlx::Error> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);

    if let Some(user_id) = user_id {
        let preference_vector = sqlx::query!(
            r#"SELECT preference_vector AS "preference_vector!: Vec<f32>" FROM user_preferences WHERE user_id = $1"#,
            user_id
        )
        .fetch_optional(db)
        .await?
        .map(|row| row.preference_vector);

        if let Some(preference_vector) = preference_vector {
            let liked_song_ids = load_user_liked_song_ids(db, user_id).await?;
            let candidates = load_candidate_songs(db, genre, &liked_song_ids).await?;

            let mut best_per_album: HashMap<Uuid, f32> = HashMap::new();
            for candidate in &candidates {
                let score = cosine_similarity(&preference_vector, &candidate.normalized_vector);
                best_per_album
                    .entry(candidate.album_id)
                    .and_modify(|existing| {
                        if score > *existing {
                            *existing = score;
                        }
                    })
                    .or_insert(score);
            }

            let mut ranked: Vec<(Uuid, f32)> = best_per_album.into_iter().collect();
            ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
            ranked.truncate(usize::try_from(limit).unwrap_or(FALLBACK_LIMIT_USIZE));

            if !ranked.is_empty() {
                let album_ids: Vec<Uuid> = ranked.iter().map(|(id, _)| *id).collect();
                let mut albums = load_albums_by_ids(db, &album_ids).await?;

                let order: HashMap<Uuid, usize> = album_ids
                    .iter()
                    .enumerate()
                    .map(|(index, id)| (*id, index))
                    .collect();
                albums.sort_by_key(|album| order.get(&album.id).copied().unwrap_or(usize::MAX));

                return Ok(albums);
            }
        }
    }

    load_freshest_albums(db, genre, limit).await
}

#[utoipa::path(
    get,
    path = "/fresh-picks",
    params(
        ("genre" = Option<String>, Query, description = "Filter by album genre; omit or pass 'All' for no filter"),
        ("limit" = Option<i64>, Query, description = "Max albums to return (default 20, max 50)"),
    ),
    responses(
        (status = 200, description = "Personalized album picks for the signed-in user, or the freshest catalog releases for signed-out visitors / users with no listening history yet", body = Vec<AlbumListItem>),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Albums"]
)]
pub async fn get_fresh_picks_handler(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    auth: AnyAuth,
) -> Result<Json<Vec<AlbumListItem>>, BSideError> {
    let user_id = match auth {
        AnyAuth::User(claims) => Some(claims.sub),
        AnyAuth::ApiKey | AnyAuth::Anonymous => None,
    };

    let genre = params
        .get("genre")
        .map(String::as_str)
        .filter(|value| !value.is_empty() && *value != "All");

    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok());

    let albums = get_fresh_picks(&state.db, user_id, genre, limit).await?;

    Ok(Json(albums))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_have_similarity_one() {
        let vector = vec![0.1, 0.5, 0.9, 0.2];
        assert!((cosine_similarity(&vector, &vector) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn orthogonal_vectors_have_similarity_zero() {
        assert!((cosine_similarity(&[1.0, 0.0], &[0.0, 1.0])).abs() < 1e-6);
    }

    #[test]
    fn mismatched_lengths_are_zero() {
        assert_eq!(cosine_similarity(&[1.0, 0.0], &[1.0, 0.0, 0.0]), 0.0);
    }

    #[test]
    fn zero_vector_is_zero() {
        assert_eq!(cosine_similarity(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
    }
}

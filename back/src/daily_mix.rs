use crate::{AppState, BSideError, Claims};
use axum::{Json, extract::State};
use chrono::{NaiveDate, Utc};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use std::collections::HashMap;
use uuid::Uuid;

pub const DAILY_MIX_SIZE: usize = 20;
const DISCOVERY_PERCENT: usize = 50;
const MAX_PER_ARTIST: usize = 2;
const MAX_PER_ALBUM: usize = 2;

#[derive(Debug, Clone, FromRow)]
struct Candidate {
    song_id: Uuid,
    album_id: Uuid,
    artist_id: Uuid,
    normalized_vector: Vec<f32>,
    heard: bool,
    skipped: bool,
}

#[derive(Debug, Clone)]
struct RankedCandidate {
    candidate: Candidate,
    score: f32,
}

#[derive(Debug, Clone)]
struct Selection {
    song_id: Uuid,
    is_discovery: bool,
    score: f32,
    reason: &'static str,
}

#[derive(Debug, serde::Serialize, FromRow, utoipa::ToSchema)]
pub struct DailyMixSong {
    pub song_id: Uuid,
    pub title: String,
    pub duration_seconds: i32,
    pub audio_url: String,
    pub album_id: Uuid,
    pub album_title: String,
    pub artist_id: Uuid,
    pub artist_name: String,
    pub cover_url: String,
    pub position: i32,
    pub is_discovery: bool,
    pub selection_reason: String,
}

#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct DailyMixResponse {
    pub id: Uuid,
    pub generation_date: NaiveDate,
    pub generated_at: chrono::DateTime<Utc>,
    pub discovery_count: i64,
    pub familiar_count: i64,
    pub songs: Vec<DailyMixSong>,
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b).map(|(left, right)| left * right).sum();
    let norm_a = a.iter().map(|value| value * value).sum::<f32>().sqrt();
    let norm_b = b.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm_a <= f32::EPSILON || norm_b <= f32::EPSILON {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

fn rank_candidates(candidates: Vec<Candidate>, preference: Option<&[f32]>) -> Vec<RankedCandidate> {
    let mut ranked = candidates
        .into_iter()
        .map(|candidate| {
            let similarity = preference
                .map(|vector| cosine_similarity(vector, &candidate.normalized_vector))
                .unwrap_or(0.0);
            let score = if candidate.skipped {
                similarity - 0.75
            } else {
                similarity
            };
            RankedCandidate { candidate, score }
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.candidate.song_id.cmp(&right.candidate.song_id))
    });
    ranked
}

fn take_diverse(
    pool: &mut Vec<RankedCandidate>,
    count: usize,
    selected: &mut Vec<Selection>,
    artist_counts: &mut HashMap<Uuid, usize>,
    album_counts: &mut HashMap<Uuid, usize>,
    reason: &'static str,
) {
    while selected.len() < count && !pool.is_empty() {
        let position = pool.iter().position(|item| {
            artist_counts
                .get(&item.candidate.artist_id)
                .copied()
                .unwrap_or(0)
                < MAX_PER_ARTIST
                && album_counts
                    .get(&item.candidate.album_id)
                    .copied()
                    .unwrap_or(0)
                    < MAX_PER_ALBUM
        });
        let index = position.unwrap_or(0);
        let item = pool.remove(index);
        *artist_counts.entry(item.candidate.artist_id).or_insert(0) += 1;
        *album_counts.entry(item.candidate.album_id).or_insert(0) += 1;
        selected.push(Selection {
            song_id: item.candidate.song_id,
            is_discovery: !item.candidate.heard,
            score: item.score,
            reason,
        });
    }
}

async fn load_candidates(db: &PgPool, user_id: Uuid) -> Result<Vec<Candidate>, sqlx::Error> {
    sqlx::query_as::<_, Candidate>(
        r#"
        SELECT
            s.id AS song_id,
            s.album_id,
            a.artist_id,
            s.normalized_vector,
            EXISTS (
                SELECT 1 FROM user_song_interactions history
                WHERE history.user_id = $1
                  AND history.song_id = s.id
                  AND history.interaction_type IN ('play', 'complete', 'replay')
            ) AS heard,
            EXISTS (
                SELECT 1 FROM user_song_interactions skips
                WHERE skips.user_id = $1
                  AND skips.song_id = s.id
                  AND skips.interaction_type = 'skip'
            ) AS skipped
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        WHERE s.status = 'Ready'
          AND a.status = 'Ready'
          AND s.normalized_vector IS NOT NULL
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

async fn select_songs(db: &PgPool, user_id: Uuid) -> Result<Vec<Selection>, sqlx::Error> {
    let preference = sqlx::query_scalar::<_, Vec<f32>>(
        "SELECT preference_vector FROM user_preferences WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    let ranked = rank_candidates(load_candidates(db, user_id).await?, preference.as_deref());
    let mut discovery = ranked
        .iter()
        .filter(|item| !item.candidate.heard)
        .cloned()
        .collect();
    let mut familiar = ranked
        .iter()
        .filter(|item| item.candidate.heard)
        .cloned()
        .collect();
    let discovery_target = DAILY_MIX_SIZE * DISCOVERY_PERCENT / 100;
    let mut selected = Vec::with_capacity(DAILY_MIX_SIZE);
    let mut artist_counts = HashMap::new();
    let mut album_counts = HashMap::new();

    take_diverse(
        &mut discovery,
        discovery_target.min(DAILY_MIX_SIZE),
        &mut selected,
        &mut artist_counts,
        &mut album_counts,
        if preference.is_some() {
            "taste_discovery"
        } else {
            "catalog_fallback"
        },
    );
    let familiar_target =
        (selected.len() + (DAILY_MIX_SIZE - discovery_target)).min(DAILY_MIX_SIZE);
    take_diverse(
        &mut familiar,
        familiar_target,
        &mut selected,
        &mut artist_counts,
        &mut album_counts,
        if preference.is_some() {
            "taste_familiar"
        } else {
            "catalog_fallback"
        },
    );
    take_diverse(
        &mut discovery,
        DAILY_MIX_SIZE,
        &mut selected,
        &mut artist_counts,
        &mut album_counts,
        if preference.is_some() {
            "taste_discovery"
        } else {
            "catalog_fallback"
        },
    );
    take_diverse(
        &mut familiar,
        DAILY_MIX_SIZE,
        &mut selected,
        &mut artist_counts,
        &mut album_counts,
        if preference.is_some() {
            "taste_familiar"
        } else {
            "catalog_fallback"
        },
    );
    Ok(selected)
}

async fn insert_mix(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    date: NaiveDate,
    selections: &[Selection],
) -> Result<Uuid, sqlx::Error> {
    let mix_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO daily_mixes (user_id, generation_date) VALUES ($1, $2) RETURNING id",
    )
    .bind(user_id)
    .bind(date)
    .fetch_one(&mut **tx)
    .await?;
    for (index, selection) in selections.iter().enumerate() {
        sqlx::query(
            r#"INSERT INTO daily_mix_songs
               (daily_mix_id, song_id, position, is_discovery, score, selection_reason)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(mix_id)
        .bind(selection.song_id)
        .bind(i32::try_from(index + 1).unwrap_or(i32::MAX))
        .bind(selection.is_discovery)
        .bind(selection.score)
        .bind(selection.reason)
        .execute(&mut **tx)
        .await?;
    }
    Ok(mix_id)
}

pub async fn ensure_daily_mix(
    db: &PgPool,
    user_id: Uuid,
    date: NaiveDate,
) -> Result<Uuid, sqlx::Error> {
    let mut tx = db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("daily-mix:{user_id}:{date}"))
        .execute(&mut *tx)
        .await?;
    if let Some((id, song_count)) = sqlx::query_as::<_, (Uuid, i64)>(
        r#"SELECT dm.id, COUNT(dms.id)
           FROM daily_mixes dm
           LEFT JOIN daily_mix_songs dms ON dms.daily_mix_id = dm.id
           WHERE dm.user_id = $1 AND dm.generation_date = $2
           GROUP BY dm.id"#,
    )
    .bind(user_id)
    .bind(date)
    .fetch_optional(&mut *tx)
    .await?
    {
        if song_count > 0 {
            tx.commit().await?;
            return Ok(id);
        }
        sqlx::query("DELETE FROM daily_mixes WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    let selections = select_songs(db, user_id).await?;
    let id = insert_mix(&mut tx, user_id, date, &selections).await?;
    tx.commit().await?;
    Ok(id)
}

pub async fn load_daily_mix(db: &PgPool, mix_id: Uuid) -> Result<DailyMixResponse, sqlx::Error> {
    let header = sqlx::query_as::<_, (Uuid, NaiveDate, chrono::DateTime<Utc>)>(
        "SELECT id, generation_date, generated_at FROM daily_mixes WHERE id = $1",
    )
    .bind(mix_id)
    .fetch_one(db)
    .await?;
    let songs = sqlx::query_as::<_, DailyMixSong>(
        r#"
        SELECT dms.song_id, s.title, s.duration_seconds, s.audio_url,
               a.id AS album_id, a.title AS album_title, ar.id AS artist_id,
               ar.name AS artist_name, a.cover_url, dms.position,
               dms.is_discovery, dms.selection_reason
        FROM daily_mix_songs dms
        JOIN songs s ON s.id = dms.song_id
        JOIN albums a ON a.id = s.album_id
        JOIN artists ar ON ar.id = a.artist_id
        WHERE dms.daily_mix_id = $1
        ORDER BY dms.position
        "#,
    )
    .bind(mix_id)
    .fetch_all(db)
    .await?;
    let discovery_count = songs.iter().filter(|song| song.is_discovery).count() as i64;
    let familiar_count = songs.len() as i64 - discovery_count;
    Ok(DailyMixResponse {
        id: header.0,
        generation_date: header.1,
        generated_at: header.2,
        discovery_count,
        familiar_count,
        songs,
    })
}

#[utoipa::path(
    get,
    path = "/users/me/daily-mix",
    responses((status = 200, description = "Today's persistent personalized song mix", body = DailyMixResponse)),
    tags = ["Recommendations"]
)]
pub async fn get_daily_mix_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<DailyMixResponse>, BSideError> {
    let mix_id = ensure_daily_mix(&state.db, claims.sub, Utc::now().date_naive()).await?;
    Ok(Json(load_daily_mix(&state.db, mix_id).await?))
}

pub async fn generate_missing_daily_mixes(
    db: &PgPool,
    date: NaiveDate,
) -> Result<u64, sqlx::Error> {
    let user_ids = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE NOT is_banned")
        .fetch_all(db)
        .await?;
    let mut generated = 0;
    for user_id in user_ids {
        let existed = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM daily_mixes WHERE user_id = $1 AND generation_date = $2)",
        )
        .bind(user_id)
        .bind(date)
        .fetch_one(db)
        .await?;
        ensure_daily_mix(db, user_id, date).await?;
        if !existed {
            generated += 1;
        }
    }
    Ok(generated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(id: u128, artist: u128, album: u128, heard: bool) -> Candidate {
        Candidate {
            song_id: Uuid::from_u128(id),
            artist_id: Uuid::from_u128(artist),
            album_id: Uuid::from_u128(album),
            normalized_vector: vec![1.0, 0.0],
            heard,
            skipped: false,
        }
    }

    #[test]
    fn cosine_similarity_handles_invalid_vectors() {
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
        assert_eq!(cosine_similarity(&[1.0], &[1.0, 2.0]), 0.0);
    }

    #[test]
    fn diverse_selection_relaxes_limits_when_catalog_is_narrow() {
        let mut pool = (1..=4)
            .map(|id| RankedCandidate {
                candidate: candidate(id, 1, 1, false),
                score: 1.0,
            })
            .collect();
        let mut selected = Vec::new();
        take_diverse(
            &mut pool,
            4,
            &mut selected,
            &mut HashMap::new(),
            &mut HashMap::new(),
            "taste_discovery",
        );
        assert_eq!(selected.len(), 4);
    }
}

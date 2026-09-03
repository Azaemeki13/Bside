use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

pub const LIKE_WEIGHT: f32 = 3.0;
pub const REPLAY_WEIGHT: f32 = 2.0;
pub const COMPLETE_WEIGHT: f32 = 1.5;
pub const PLAY_WEIGHT: f32 = 0.5;
pub const SKIP_WEIGHT: f32 = -1.0;

// Weight constants
//LIKE_WEIGHT
//REPLAY_WEIGHT
//COMPLETE_WEIGHT
//PLAY_WEIGHT
//SKIP_WEIGHT

// Calculate the weight of a single playback behavior
//playback_weight()

// Aggregate playback weights by song
//aggregate_playback_weights()

// Load user playback weights from the database
//load_user_playback_weights()

// Load the current Liked Songs
//load_user_liked_song_ids()

// Merge playback weights and like weights
//load_user_song_weights()

// Calculate the user preference vector
//calculate_user_preference_vector()

// Save the user preference vector
//save_user_preference_vector()

// Delete the invalid preference vector
//delete_user_preference()

// Recalculate and save the preference vector
//refresh_user_preference()

#[must_use]
pub fn playback_weight(interaction_type: &str) -> f32 {
    match interaction_type {
        "replay" => REPLAY_WEIGHT,
        "complete" => COMPLETE_WEIGHT,
        "play" => PLAY_WEIGHT,
        "skip" => SKIP_WEIGHT,
        _ => 0.0,
    }
}

#[must_use]
pub fn aggregate_playback_weights(interactions: &[(Uuid, String)]) -> HashMap<Uuid, f32> {
    let mut song_weights = HashMap::new();

    for (song_id, interaction_type) in interactions {
        let weight = playback_weight(interaction_type);

        if weight == 0.0 {
            continue;
        }

        *song_weights.entry(*song_id).or_insert(0.0) += weight;
    }

    song_weights.retain(|_, weight| *weight != 0.0);

    song_weights
}

pub async fn load_user_playback_weights(
    db: &PgPool,
    user_id: Uuid,
) -> Result<HashMap<Uuid, f32>, sqlx::Error> {
    let interactions = sqlx::query!(
        r#"
        SELECT song_id, interaction_type
        FROM user_song_interactions
        WHERE user_id = $1
          AND interaction_type IN ('play', 'complete', 'skip', 'replay')
        ORDER BY created_at ASC
        "#,
        user_id
    )
    .fetch_all(db)
    .await?;

    let interactions = interactions
        .into_iter()
        .map(|interaction| (interaction.song_id, interaction.interaction_type))
        .collect::<Vec<_>>();

    Ok(aggregate_playback_weights(&interactions))
}

pub async fn load_user_liked_song_ids(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<Uuid>, sqlx::Error> {
    let liked_songs = sqlx::query_scalar!(
        r#"
        SELECT DISTINCT ps.song_id
        FROM playlist_songs ps
        JOIN playlists p ON p.id = ps.playlist_id
        WHERE p.owner_id = $1
          AND p.title = 'Liked Songs'
        "#,
        user_id
    )
    .fetch_all(db)
    .await?;

    Ok(liked_songs)
}

pub async fn load_user_song_weights(
    db: &PgPool,
    user_id: Uuid,
) -> Result<HashMap<Uuid, f32>, sqlx::Error> {
    let mut song_weights = load_user_playback_weights(db, user_id).await?;
    let liked_song_ids = load_user_liked_song_ids(db, user_id).await?;

    for song_id in liked_song_ids {
        *song_weights.entry(song_id).or_insert(0.0) += LIKE_WEIGHT;
    }

    song_weights.retain(|_, weight| *weight != 0.0);

    Ok(song_weights)
}

pub async fn calculate_user_preference_vector(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Option<Vec<f32>>, sqlx::Error> {
    let song_weights = load_user_song_weights(db, user_id).await?;

    if song_weights.is_empty() {
        return Ok(None);
    }

    let song_ids = song_weights.keys().copied().collect::<Vec<_>>();

    let songs = sqlx::query!(
        r#"
        SELECT
            id,
            normalized_vector AS "normalized_vector!: Vec<f32>"
        FROM songs
        WHERE id = ANY($1)
          AND normalized_vector IS NOT NULL
        "#,
        &song_ids[..]
    )
    .fetch_all(db)
    .await?;

    let mut weighted_sum: Option<Vec<f32>> = None;

    for song in songs {
        let Some(weight) = song_weights.get(&song.id).copied() else {
            continue;
        };

        let song_vector = song.normalized_vector;

        match &mut weighted_sum {
            None => {
                weighted_sum = Some(song_vector.iter().map(|value| *value * weight).collect());
            }
            Some(sum) => {
                if sum.len() != song_vector.len() {
                    continue;
                }

                for (sum_value, song_value) in sum.iter_mut().zip(song_vector.iter()) {
                    *sum_value += *song_value * weight;
                }
            }
        }
    }

    let Some(mut preference_vector) = weighted_sum else {
        return Ok(None);
    };

    let norm = preference_vector
        .iter()
        .map(|value| value * value)
        .sum::<f32>()
        .sqrt();

    if norm <= f32::EPSILON {
        return Ok(None);
    }

    for value in &mut preference_vector {
        *value /= norm;
    }

    Ok(Some(preference_vector))
}

pub async fn save_user_preference_vector(
    db: &PgPool,
    user_id: Uuid,
    preference_vector: &[f32],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO user_preferences (
            user_id,
            preference_vector,
            updated_at
        )
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            preference_vector = EXCLUDED.preference_vector,
            updated_at = NOW()
        "#,
        user_id,
        preference_vector
    )
    .execute(db)
    .await?;

    Ok(())
}

pub async fn delete_user_preference(db: &PgPool, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM user_preferences
        WHERE user_id = $1
        "#,
        user_id
    )
    .execute(db)
    .await?;

    Ok(())
}

pub async fn refresh_user_preference(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Option<Vec<f32>>, sqlx::Error> {
    let preference_vector = calculate_user_preference_vector(db, user_id).await?;

    match &preference_vector {
        Some(vector) => {
            save_user_preference_vector(db, user_id, vector).await?;
        }
        None => {
            delete_user_preference(db, user_id).await?;
        }
    }

    Ok(preference_vector)
}

/// Recompute and persist the preference vector for every non-banned user.
///
/// The per-interaction refresh in the handlers keeps a user's vector current
/// while they are active. This batch pass is what the Daily Mix worker runs each
/// night before building mixes, so vectors also move for users whose history
/// changed without hitting those handlers - seed/batch-loaded interactions, or
/// anything that landed while the worker was down.
///
/// Returns `(recomputed, cleared)`: users given a fresh vector, and users whose
/// vector was removed because they no longer have any weighted history.
pub async fn refresh_all_user_preferences(db: &PgPool) -> Result<(u64, u64), sqlx::Error> {
    let user_ids = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE NOT is_banned")
        .fetch_all(db)
        .await?;

    let mut recomputed = 0u64;
    let mut cleared = 0u64;
    for user_id in user_ids {
        match refresh_user_preference(db, user_id).await? {
            Some(_) => recomputed += 1,
            None => cleared += 1,
        }
    }
    Ok((recomputed, cleared))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_expected_playback_weights() {
        assert_eq!(playback_weight("replay"), 2.0);
        assert_eq!(playback_weight("complete"), 1.5);
        assert_eq!(playback_weight("play"), 0.5);
        assert_eq!(playback_weight("skip"), -1.0);
    }

    #[test]
    fn like_weight_is_three() {
        assert_eq!(LIKE_WEIGHT, 3.0);
    }

    #[test]
    fn like_and_unlike_are_not_playback_weights() {
        assert_eq!(playback_weight("like"), 0.0);
        assert_eq!(playback_weight("unlike"), 0.0);
    }

    #[test]
    fn unknown_interaction_has_zero_weight() {
        assert_eq!(playback_weight("unknown"), 0.0);
    }
}

use crate::{AppState, AnyAuth, BSideError, RawSearchResult, SearchResult};
use axum::Json;
use axum::extract::{Query, State};
use std::collections::HashMap;

#[utoipa::path(
    get,
    path = "/search",
    params(("q" = String, Query, description = "Search query string")),
    responses(
        (status = 200, description = "Search results from songs, albums, artists, and playlists", body = Vec<SearchResult>),
        (status = 400, description = "Missing or invalid query parameter"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Search"]
)]
pub async fn searcher(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    _auth: AnyAuth,
) -> Result<Json<Vec<SearchResult>>, BSideError> {
    let query_str = params
        .get("q")
        .ok_or(BSideError::BadRequest("Missing query".into()))?;
    let rows = sqlx::query_as!(
    RawSearchResult,
    r#"
    WITH candidates AS (
    -- 1 Songs
        SELECT s.id, s.title as name, 'song' as entity_type, ar.name as metadata, s.audio_url, s.album_id,
            to_tsvector('english', unaccent(s.title) || ' ' || unaccent(ar.name)) as doc,
            (unaccent(s.title) || ' ' || unaccent(ar.name)) as raw_text
        FROM songs s
        JOIN albums a ON s.album_id = a.id
        JOIN artists ar ON a.artist_id = ar.id
        WHERE s.status = 'Ready'
        
        UNION ALL
        
    -- 2 Albums
        SELECT a.id, a.title as name, 'album' as entity_type, ar.name as metadata, NULL as audio_url, a.id as album_id,
            to_tsvector('english', unaccent(a.title) || ' ' || unaccent(ar.name)) as doc,
            (unaccent(a.title) || ' ' || unaccent(ar.name)) as raw_text
        FROM albums a
        JOIN artists ar ON a.artist_id = ar.id
        WHERE a.status = 'Ready'
        
    -- 3 Artists 
        UNION ALL
        SELECT id, name, 'artist' as entity_type, NULL as metadata, NULL as audio_url, id as album_id,
            to_tsvector('english', unaccent(name)) as doc,
            unaccent(name) as raw_text
        FROM artists
        WHERE status = 'Ready'
        
    -- 4 Playlists
        UNION ALL
        SELECT p.id, p.title as name, 'playlist' as entity_type, u.username as metadata, NULL as audio_url, p.id as album_id,
            to_tsvector('english', unaccent(p.title) || ' ' || unaccent(u.username)) as doc,
            (unaccent(p.title) || ' ' || unaccent(u.username)) as raw_text
        FROM playlists p
        JOIN users u ON p.owner_id = u.id
        WHERE p.is_public = true
    )
    SELECT 
        id as "id!", name as "name!", entity_type as "entity_type!", metadata, audio_url, album_id as "album_id!",
        (
            ts_rank(doc, websearch_to_tsquery('english', $1)) * 0.6 + 
            GREATEST(similarity(raw_text, $1), similarity(COALESCE(metadata, ''), $1)) * 0.4
        ) as "rank!"
    FROM candidates
    WHERE doc @@ websearch_to_tsquery('english', $1)
        OR name % $1
        OR COALESCE(metadata, '') % $1
    ORDER BY "rank!" DESC
    LIMIT 20
    "#,
    query_str
    )
    .fetch_all(&state.db)
    .await?;

    let results = rows
        .into_iter()
        .map(|row| match row.entity_type.as_str() {
            "song" => SearchResult::Song {
                id: row.id,
                title: row.name,
                artist: row.metadata.unwrap_or_default(),
                audio_url: row.audio_url.unwrap_or_default(),
                album_id: row.album_id,
            },
            "album" => SearchResult::Album {
                id: row.id,
                name: row.name,
                artist: row.metadata.unwrap_or_default(),
            },
            "playlist" => SearchResult::Playlist {
                id: row.id,
                name: row.name,
                creator: row.metadata.unwrap_or_else(|| "Unknown".to_string()),
            },
            _ => SearchResult::Artist {
                id: row.id,
                name: row.name,
            },
        })
        .collect();

    Ok(Json(results))
}

use crate::daily_mix::{DailyMixResponse, DailyMixSong};
use crate::models::{
    AddSongResponse, AdminUpdateUserPayload, AlbumDetailedResponse, AlbumListItem, AlbumResponse,
    AlbumSongItem, ArtistDetailResponse, ArtistRequestPayload, ArtistRequestResponse,
    ArtistRequestReviewPayload, ArtistResponse, ArtistSongItem, AuthResponse, ChatMessage,
    ConversationListItem, DailyActivityStat, LoginPayload, MarkMessagesReadResponse,
    NewReleaseSong, PlaybackInteractionType, Playlist, PlaylistDetailedResponse, PlaylistPayload,
    PlaylistSongItem, PublicUser, RawSearchResult, RecentPlayItem, RegisterPayload, SearchResponse,
    SearchResult, SharedSong, Song, SongInteractionPayload, SongPayload, SongResponse, TopSongStat,
    TopSpinItem, UpdateStructurePayload, User, UserActivityAnalytics,
};
use crate::public_api::{PublicApiArtist, PublicApiArtistList, PublicApiArtistPayload};
use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};
use utoipa::{Modify, OpenApi, openapi};

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "api_key",
                SecurityScheme::ApiKey(ApiKey::Header(ApiKeyValue::with_description(
                    "X-API-Key",
                    "B-Side public catalog API key",
                ))),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::handlers::ping_handler,
        crate::handlers::register_handler,
        crate::handlers::classic_auth_handler,
        crate::handlers::google_login_handler,
        crate::handlers::google_signup_handler,
        crate::handlers::google_callback_handler,
        crate::handlers::get_me_handler,
        crate::handlers::get_all_users_handler,
        crate::handlers::get_user_by_id_handler,
        crate::handlers::create_artist_handler,
        crate::handlers::get_artist_by_id_handler,
        crate::handlers::create_artist_request_handler,
        crate::handlers::get_artist_requests_handler,
        crate::handlers::review_artist_request_handler,
        crate::handlers::create_album_handler,
        crate::handlers::get_my_albums_handler,
        crate::handlers::get_album_by_id_handler,
        crate::handlers::delete_album_handler,
        crate::handlers::create_song_handler,
        crate::handlers::verify_song_handler,
        crate::handlers::delete_song_handler,
        crate::handlers::get_liked_songs_handler,
        crate::handlers::like_song_handler,
        crate::handlers::unlike_song_handler,
        crate::handlers::create_playlist_handler,
        crate::handlers::get_playlist_by_id_handler,
        crate::handlers::update_playlist_handler,
        crate::handlers::delete_playlist_handler,
        crate::handlers::add_song_to_playlist_handler,
        crate::handlers::remove_song_from_pl,
        crate::search::searcher,
        crate::handlers::get_conversation_messages_handler,
        crate::handlers::mark_conversation_messages_as_read_handler,
        crate::handlers::get_conversations_handler,
        crate::handlers::record_song_interaction_handler,
        crate::handlers::admin_get_all_users_handler,
        crate::handlers::admin_update_user_handler,
        crate::handlers::admin_delete_user_handler,
        crate::handlers::get_user_activity_analytics_handler,
        crate::handlers::get_recent_plays_handler,
        crate::handlers::get_top_spins_handler,
        crate::handlers::get_new_release_handler,
        crate::recommendations::get_fresh_picks_handler,
        crate::daily_mix::get_daily_mix_handler,
        crate::public_api::list_artists,
        crate::public_api::create_artist,
        crate::public_api::get_artist,
        crate::public_api::update_artist,
        crate::public_api::delete_artist,
    ),
    components(
        schemas(
            User, PublicUser, AdminUpdateUserPayload, Song, SongPayload, SongResponse, AddSongResponse, SongInteractionPayload,
            PlaybackInteractionType, Playlist, UpdateStructurePayload, PlaylistDetailedResponse, PlaylistSongItem,
            AlbumResponse, AlbumListItem, AlbumSongItem, AlbumDetailedResponse,
            ArtistResponse, ArtistSongItem, ArtistDetailResponse, ArtistRequestPayload,
            ArtistRequestReviewPayload, ArtistRequestResponse, PlaylistPayload, AuthResponse,
            RegisterPayload, LoginPayload, RawSearchResult, SearchResponse, SearchResult, ChatMessage, MarkMessagesReadResponse, SharedSong,
            ConversationListItem, TopSongStat, DailyActivityStat, UserActivityAnalytics,
            RecentPlayItem, TopSpinItem, NewReleaseSong,
            DailyMixResponse, DailyMixSong,
            PublicApiArtist, PublicApiArtistList, PublicApiArtistPayload,
        )
    ),
    modifiers(&SecurityAddon),
    info(title = "B-Side API", version = "0.1.0", description = "Music production and artist platform API"),
    servers(
        (url = "https://localhost/api", description = "Local HTTPS gateway"),
    ),
)]
pub struct ApiDoc;

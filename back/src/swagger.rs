use crate::models::{
    AddSongResponse, AlbumDetailedResponse, AlbumListItem, AlbumResponse, AlbumSongItem,
    ArtistDetailResponse, ArtistRequestPayload, ArtistRequestResponse, ArtistRequestReviewPayload,
    ArtistResponse, ArtistSongItem, AuthResponse, ChatMessage, ConversationListItem, LoginPayload,
    MarkMessagesReadResponse, PlaybackInteractionType, Playlist, PlaylistDetailedResponse,
    PlaylistPayload, PlaylistSongItem, RawSearchResult, RegisterPayload, SearchResult, SharedSong,
    Song, SongInteractionPayload, SongPayload, SongResponse, UpdateStructurePayload, User,
    UserPayload,
};
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::handlers::ping_handler,
        crate::handlers::register_handler,
        crate::handlers::classic_auth_handler,
        crate::handlers::google_login_handler,
        crate::handlers::google_signup_handler,
        crate::handlers::google_callback_handler,
        crate::handlers::create_user_handler,
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
    ),
    components(
        schemas(
            User, UserPayload, Song, SongPayload, SongResponse, AddSongResponse, SongInteractionPayload,
            PlaybackInteractionType, Playlist, UpdateStructurePayload, PlaylistDetailedResponse, PlaylistSongItem,
            AlbumResponse, AlbumListItem, AlbumSongItem, AlbumDetailedResponse,
            ArtistResponse, ArtistSongItem, ArtistDetailResponse, ArtistRequestPayload,
            ArtistRequestReviewPayload, ArtistRequestResponse, PlaylistPayload, AuthResponse,
            RegisterPayload, LoginPayload, RawSearchResult, SearchResult, ChatMessage, MarkMessagesReadResponse, SharedSong,
            ConversationListItem,
        )
    ),
    info(title = "B-Side API", version = "0.1.0", description = "Music production and artist platform API"),
    servers(
        (url = "http://localhost:8080", description = "Local development server"),
        (url = "http://0.0.0.0:8080", description = "Server endpoint"),
    ),
)]
pub struct ApiDoc;

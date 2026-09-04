//! HTTP handlers, one file per feature area. Each submodule owns the
//! request/response wiring for a slice of the API surface; shared
//! validation and permission helpers live in [`util`].
//!
//! Every public handler here is re-exported at `crate::handlers::*` so the
//! route table in `main.rs` and the `OpenAPI` registry in `swagger.rs` can
//! keep referring to `crate::handlers::some_handler` regardless of which
//! file it actually lives in.

mod accounts;
mod admin;
mod albums;
mod analytics;
mod artist_requests;
mod artists;
mod interactions;
mod likes;
mod messages;
mod misc;
mod playlists;
mod social;
mod songs;
mod users;
mod util;

pub use accounts::*;
pub use admin::*;
pub use albums::*;
pub use analytics::*;
pub use artist_requests::*;
pub use artists::*;
pub use interactions::*;
pub use likes::*;
pub use messages::*;
pub use misc::*;
pub use playlists::*;
pub use social::*;
pub use songs::*;
pub use users::*;

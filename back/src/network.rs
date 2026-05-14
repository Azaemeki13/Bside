use std::collections::HashMap;
use std::sync::{Arc};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

pub type WsSender = mpsc :: UnboundedSender<String>;

pub type OnlineUsers = Arc<Mutex<HashMap<Uuid, WsSender>>>;

#[derive(Clone)]
pub struct NetworkState {
    pub online_users: OnlineUsers,
}

impl NetworkState {
    pub fn new() -> Self {
        Self {
            online_users: Arc::new(Mutex::new(HashMap::new())),
    }
    }
}
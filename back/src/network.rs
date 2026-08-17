use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use uuid::Uuid;

pub type WsSender = mpsc::UnboundedSender<String>;

pub type UserConnections = HashMap<Uuid, WsSender>;
pub type OnlineUsers = Arc<Mutex<HashMap<Uuid, UserConnections>>>;

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

    pub async fn register(&self, user_id: Uuid, connection_id: Uuid, sender: WsSender) {
        self.online_users
            .lock()
            .await
            .entry(user_id)
            .or_default()
            .insert(connection_id, sender);
    }

    pub async fn unregister(&self, user_id: Uuid, connection_id: Uuid) -> bool {
        let mut users = self.online_users.lock().await;
        let Some(connections) = users.get_mut(&user_id) else {
            return true;
        };
        connections.remove(&connection_id);
        if connections.is_empty() {
            users.remove(&user_id);
            true
        } else {
            false
        }
    }

    pub async fn send_to_user(&self, user_id: Uuid, message: &str) -> usize {
        let senders = {
            let users = self.online_users.lock().await;
            users
                .get(&user_id)
                .map(|connections| {
                    connections
                        .iter()
                        .map(|(id, sender)| (*id, sender.clone()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        };
        let mut delivered = 0;
        let mut failed = Vec::new();
        for (connection_id, sender) in senders {
            if sender.send(message.to_string()).is_ok() {
                delivered += 1;
            } else {
                failed.push(connection_id);
            }
        }
        if !failed.is_empty() {
            let mut users = self.online_users.lock().await;
            if let Some(connections) = users.get_mut(&user_id) {
                for connection_id in failed {
                    connections.remove(&connection_id);
                }
                if connections.is_empty() {
                    users.remove(&user_id);
                }
            }
        }
        delivered
    }

    pub async fn is_online(&self, user_id: Uuid) -> bool {
        self.online_users.lock().await.contains_key(&user_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn multiple_connections_survive_independent_disconnects() {
        let state = NetworkState::new();
        let user = Uuid::new_v4();
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let (first_tx, mut first_rx) = mpsc::unbounded_channel();
        let (second_tx, mut second_rx) = mpsc::unbounded_channel();
        state.register(user, first, first_tx).await;
        state.register(user, second, second_tx).await;
        assert_eq!(state.send_to_user(user, "hello").await, 2);
        assert_eq!(first_rx.recv().await.as_deref(), Some("hello"));
        assert_eq!(second_rx.recv().await.as_deref(), Some("hello"));
        assert!(!state.unregister(user, first).await);
        assert!(state.is_online(user).await);
        assert!(state.unregister(user, second).await);
        assert!(!state.is_online(user).await);
    }

    #[tokio::test]
    async fn failed_connection_is_pruned_without_removing_healthy_connection() {
        let state = NetworkState::new();
        let user = Uuid::new_v4();
        let (failed_tx, failed_rx) = mpsc::unbounded_channel();
        drop(failed_rx);
        let (healthy_tx, mut healthy_rx) = mpsc::unbounded_channel();
        state.register(user, Uuid::new_v4(), failed_tx).await;
        state.register(user, Uuid::new_v4(), healthy_tx).await;
        assert_eq!(state.send_to_user(user, "message").await, 1);
        assert_eq!(healthy_rx.recv().await.as_deref(), Some("message"));
        assert!(state.is_online(user).await);
    }
}

export interface LoginPayload {
    identifier: string;
    password: string;
}

export interface AuthResponse {
    user: {
        id: string;
        username: string;
        email: string;
        role: string;
        avatar_url: string;
    };
    token: string;
}
import subprocess
import webbrowser
import http.server
import socketserver
import urllib.parse
import requests
import sys
import time

BASE_URL = "http://localhost:8080"
REDIRECT_PORT = 8081
JWT_TOKEN = None

def clear_env():
    print("Clearing DB && Minio...")
    try:
        subprocess.run(["sudo", "docker", "exec", "-i", "bside_db_dev", "psql", "-U", "bside_admin", "-d", "bside_db", "-c", 
                        "TRUNCATE users, songs, albums, playlists, playlist_songs CASCADE;"], check=True)
        subprocess.run(["/home/ituriel/.local/bin/mc", "rm", "--recursive", "--force", "local/bside-tracks/"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Failed to clear environment: {e}")
        sys.exit(1)

class OAuthHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global JWT_TOKEN
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        if "token" in params:
            JWT_TOKEN = params["token"][0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Token captured. You can close this window!")
            print("JWT Captured successfully.")
            raise SystemExit

def get_jwt():
    print(f"Opening browser for Auth.. Listening on port {REDIRECT_PORT}")
    webbrowser.open(f"{BASE_URL}/auth/google/login")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", REDIRECT_PORT), OAuthHandler) as httpd:
        try:
            httpd.handle_request()
        except SystemExit:
            pass

def check_minio_path(s3_key):
    result = subprocess.run(["/home/ituriel/.local/bin/mc", "stat", f"local/bside-tracks/{s3_key}"], capture_output=True, text=True)
    return result.returncode == 0

def run_audit():
    headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
    
    print("Auditing User..")
    me = requests.get(f"{BASE_URL}/users/me", headers=headers).json()
    
    print("Creating test album..")
    album_res = requests.post(f"{BASE_URL}/albums", 
                              json={"title": "Test Album"}, 
                              headers=headers).json()
    album_id = album_res['id']

    print("Auditing good song creation..")
    song_res = requests.post(f"{BASE_URL}/songs", 
                              json={
                                  "title": "Good Track",
                                  "album_id": album_id,
                                  "primary_artist_id": me['id'],
                                  "duration_seconds": 180,
                                  "format": "flac"
                              },
                              headers=headers).json()
    
    song_id = song_res['song']['id']
    upload_url = song_res['upload_url']
    s3_key = song_res['song']['audio_url']

    print("Uploading real FLAC bytes to MinIO...")
    good_flac = b"fLaC" + b"\x00" * 28
    
    upload_res = requests.put(upload_url, data=good_flac, headers={"Content-Type": "audio/flac"})
    assert upload_res.status_code == 200

    print("Notifying Backend to verify good song...")
    backend_verify = requests.put(f"{BASE_URL}/songs/{song_id}/verify", headers=headers)
    
    if backend_verify.status_code != 200:
        print(f"Backend failed to verify good song: {backend_verify.status_code}")
        print(f"Error: {backend_verify.text}")
        sys.exit(1)

    assert check_minio_path(s3_key) == True
    print("Good Song verified and persistent.")

    print("Auditing bad song rejection..")
    bad_song_res = requests.post(f"{BASE_URL}/songs",
                                 json={
                                     "title": "Bad song",
                                     "album_id": album_id,
                                     "primary_artist_id": me['id'],
                                     "duration_seconds": 180,
                                     "format": "flac"
                                 },
                                 headers=headers).json()
    
    bad_id = bad_song_res['song']['id']
    bad_url = bad_song_res['upload_url']
    bad_key = bad_song_res['song']['audio_url']

    print("Uploading trash data to MinIO...")
    bad_upload = requests.put(bad_url, data=b"NOT_A_SONG_JUST_TEXT_TRASH", headers={"Content-Type": "audio/flac"})
    assert bad_upload.status_code == 200

    print("Notifying Backend to verify bad song...")
    bad_verify = requests.put(f"{BASE_URL}/songs/{bad_id}/verify", headers=headers)
    if bad_verify.status_code not in [400, 415]:
        print(f"Logic Error: Backend should have rejected trash but returned {bad_verify.status_code}")
        sys.exit(1)
    print("Checking if MinIO was cleared...")
    time.sleep(1.5)
    assert check_minio_path(bad_key) == False
    print("Rejection logic verified! MinIO bucket was cleared.")

if __name__ == "__main__":
    clear_env()
    get_jwt()
    if JWT_TOKEN:
        run_audit()
        print("\nALL HANDLERS VERIFIED.")

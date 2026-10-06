import os
import io
import json
import time
import base64
import requests
import rsa

class GoogleDriveService:
    def __init__(self):
        # We look for a credentials.json file in the python root directory
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.credentials_path = os.path.join(base_dir, 'credentials.json')
        self.scopes = 'https://www.googleapis.com/auth/drive'
        self.access_token = None
        self.token_expiry = 0
        self.creds_data = None
        
        self._load_credentials()

    def _load_credentials(self):
        try:
            if os.path.exists(self.credentials_path):
                with open(self.credentials_path, 'r') as f:
                    self.creds_data = json.load(f)
                print("Found Google Drive credentials.")
            else:
                print(f"Warning: Google Drive credentials not found at {self.credentials_path}")
        except Exception as e:
            print(f"Error loading Google Drive credentials: {e}")

    def is_authenticated(self):
        return self.creds_data is not None

    def _b64_encode(self, data):
        if isinstance(data, str):
            data = data.encode('utf-8')
        return base64.urlsafe_b64encode(data).replace(b'=', b'').decode('utf-8')

    def _get_access_token(self):
        if not self.is_authenticated():
            raise Exception("Google Drive is not authenticated. Please provide credentials.json")
            
        now = int(time.time())
        # Return cached token if valid
        if self.access_token and now < self.token_expiry - 60:
            return self.access_token
            
        header = {"alg": "RS256", "typ": "JWT"}
        claim = {
            "iss": self.creds_data["client_email"],
            "scope": self.scopes,
            "aud": "https://oauth2.googleapis.com/token",
            "exp": now + 3600,
            "iat": now
        }
        
        header_b64 = self._b64_encode(json.dumps(header))
        claim_b64 = self._b64_encode(json.dumps(claim))
        signature_input = f"{header_b64}.{claim_b64}".encode('utf-8')
        
        # Parse private key
        private_key = rsa.PrivateKey.load_pkcs1(self.creds_data["private_key"].encode('utf-8'))
        signature = rsa.sign(signature_input, private_key, 'SHA-256')
        signature_b64 = self._b64_encode(signature)
        
        jwt_token = f"{header_b64}.{claim_b64}.{signature_b64}"
        
        resp = requests.post("https://oauth2.googleapis.com/token", data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt_token
        })
        
        if resp.status_code != 200:
            raise Exception(f"Failed to get access token: {resp.text}")
            
        token_data = resp.json()
        self.access_token = token_data["access_token"]
        self.token_expiry = now + token_data["expires_in"]
        
        return self.access_token

    def upload_file(self, file_name, file_bytes, mime_type, folder_id=None):
        token = self._get_access_token()
        
        # We use a multipart upload
        metadata = {'name': file_name}
        if folder_id:
            metadata['parents'] = [folder_id]
            
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        files = {
            'metadata': ('metadata.json', json.dumps(metadata), 'application/json'),
            'file': (file_name, file_bytes, mime_type)
        }
        
        resp = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
            headers=headers,
            files=files
        )
        
        if resp.status_code != 200:
            raise Exception(f"Failed to upload file: {resp.text}")
            
        result = resp.json()
        return result.get("id"), result.get("webViewLink")

    def download_file(self, file_id):
        token = self._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        resp = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
            headers=headers
        )
        
        if resp.status_code != 200:
            raise Exception(f"Failed to download file: {resp.text}")
            
        return resp.content

drive_service = GoogleDriveService()

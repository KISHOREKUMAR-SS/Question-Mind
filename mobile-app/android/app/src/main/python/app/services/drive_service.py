"""
Google Drive Service — optional file sharing for question banks.

Requires:
  GOOGLE_SERVICE_ACCOUNT_JSON  — path to a service-account credentials .json file
  GOOGLE_DRIVE_FOLDER_ID       — the ID of the shared Drive folder

If either setting is blank the service is disabled and upload() returns None.
"""

import os
import logging
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)


def _drive_configured() -> bool:
    has_service_account = bool(settings.GOOGLE_SERVICE_ACCOUNT_JSON and settings.GOOGLE_DRIVE_FOLDER_ID)
    has_oauth = bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET and settings.GOOGLE_REFRESH_TOKEN and settings.GOOGLE_DRIVE_FOLDER_ID)
    return has_service_account or has_oauth


def upload_to_drive(local_path: str, filename: str, is_image: bool = False) -> Optional[str]:
    """
    Upload a file to the configured Google Drive folder.

    Returns the file's web-view URL (shareable link), or None if Drive is not
    configured or the upload fails.
    """
    if not _drive_configured():
        logger.info("[DriveService] Not configured — skipping Drive upload.")
        return None

    try:
        from googleapiclient.discovery import build  # type: ignore
        from googleapiclient.http import MediaFileUpload  # type: ignore
        from google.oauth2 import service_account  # type: ignore

        scopes = ["https://www.googleapis.com/auth/drive.file"]

        if settings.GOOGLE_REFRESH_TOKEN and settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
            from google.oauth2.credentials import Credentials  # type: ignore
            creds = Credentials(
                token=None,
                refresh_token=settings.GOOGLE_REFRESH_TOKEN,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.GOOGLE_CLIENT_ID,
                client_secret=settings.GOOGLE_CLIENT_SECRET,
                scopes=scopes
            )
        else:
            json_path = settings.GOOGLE_SERVICE_ACCOUNT_JSON.strip()
            if json_path.startswith("{"):
                import json
                service_account_info = json.loads(json_path)
                creds = service_account.Credentials.from_service_account_info(
                    service_account_info, scopes=scopes
                )
            else:
                creds = service_account.Credentials.from_service_account_file(
                    json_path, scopes=scopes
                )
        service = build("drive", "v3", credentials=creds, cache_discovery=False)

        # Determine MIME type
        if is_image:
            ext = os.path.splitext(filename)[1].lower()
            if ext in ['.png']: mime = 'image/png'
            elif ext in ['.jpg', '.jpeg']: mime = 'image/jpeg'
            elif ext in ['.gif']: mime = 'image/gif'
            elif ext in ['.webp']: mime = 'image/webp'
            elif ext in ['.svg']: mime = 'image/svg+xml'
            else: mime = 'application/octet-stream'
        else:
            mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        file_metadata = {
            "name": filename,
            "parents": [settings.GOOGLE_DRIVE_FOLDER_ID],
        }

        media = MediaFileUpload(local_path, mimetype=mime, resumable=False)
        uploaded = (
            service.files()
            .create(body=file_metadata, media_body=media, fields="id,webViewLink")
            .execute()
        )

        # Make the file readable by anyone with the link
        service.permissions().create(
            fileId=uploaded["id"],
            body={"type": "anyone", "role": "reader"},
        ).execute()

        if is_image:
            # For images, return a direct view link embeddable in <img> tags
            link = f"https://drive.google.com/uc?export=view&id={uploaded['id']}"
        else:
            link = uploaded.get("webViewLink")
            
        logger.info(f"[DriveService] Uploaded '{filename}' → {link}")
        return link

    except ImportError:
        logger.warning(
            "[DriveService] google-api-python-client not installed. "
            "Run: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib"
        )
        return None

    except Exception as e:
        logger.error(f"[DriveService] Upload failed: {e}")
        return None

"""
Email Service — sends question bank share notifications via SMTP.

Works with:
  - Brevo (Brevo/Bravo) for web/Render deployment
  - Any SMTP provider for local/mobile server
"""

import smtplib
import httpx
import base64
import os
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional

from ..config import settings

import logging
logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    provider = settings.EMAIL_PROVIDER.lower()
    logger.info(
        f"[EmailService] Checking configuration — Provider: {provider} | "
        f"Host: {settings.SMTP_HOST} | Port: {settings.SMTP_PORT} | "
        f"User: {settings.SMTP_USER} | FromEmail: {settings.FROM_EMAIL} | "
        f"HasSmtpPass: {bool(settings.SMTP_PASS)} | HasBrevoApiKey: {bool(settings.BREVO_API_KEY)}"
    )
    if provider == "local":
        return True
    if provider == "brevo":
        # The Brevo HTTP API path only needs the REST API key + a verified sender.
        if settings.BREVO_API_KEY and settings.FROM_EMAIL:
            return True
        # Otherwise fall back to SMTP credentials (works locally; blocked on Render).
        return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS and settings.FROM_EMAIL)
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS and settings.FROM_EMAIL)

def _get_smtp_server():
    provider = settings.EMAIL_PROVIDER.lower()
    if provider == "local":
        host = settings.SMTP_HOST or "localhost"
        port = settings.SMTP_PORT if settings.SMTP_PORT != 587 else 1025
        return smtplib.SMTP(host, port, timeout=30)
    else:
        port = 2525 if (settings.SMTP_PORT == 587 and "brevo" in settings.SMTP_HOST.lower()) else settings.SMTP_PORT
        server = smtplib.SMTP(settings.SMTP_HOST, port, timeout=30)
        server.ehlo()
        server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASS:
            server.login(settings.SMTP_USER, settings.SMTP_PASS)
        return server


def send_share_notification(
    recipients: List[str],
    bank_title: str,
    subject_name: str,
    subject_code: str,
    sender_name: str,
    excel_path: Optional[str] = None
) -> dict:
    if not _smtp_configured():
        logger.warning("[EmailService] SMTP not configured — skipping email notifications.")
        return {"sent": [], "failed": recipients, "skipped": True}

    sent, failed = [], []
    html_body = _build_html_email(bank_title, subject_name, subject_code, sender_name)
    subject = f"📚 Question Bank Shared — {subject_code}: {bank_title}"

    for recipient in recipients:
        success = _send_email_core(recipient, subject, html_body, excel_path)
        if success:
            sent.append(recipient)
        else:
            failed.append(recipient)

    return {"sent": sent, "failed": failed, "skipped": False}



def _build_html_email(
    bank_title: str,
    subject_name: str,
    subject_code: str,
    sender_name: str,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Question Bank Shared</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(139, 92, 246, 0.06); border: 1px solid #f1f5f9;">
          <!-- Header gradient -->
          <tr>
            <td style="background:linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);padding:40px 32px;text-align:center;">
              <!-- LOGO -->
              <img src="{settings.LOGO_URL}?v={int(time.time())}" alt="Krish Academia" height="75" style="display:block;margin:0 auto 16px;height:75px;width:auto;max-width:240px;border:0;outline:none;text-decoration:none;" />
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.3;">
                📚 Question Bank Shared With You
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;">
                {subject_code} — {subject_name}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.6;font-weight:500;">
                Hello 👋,
              </p>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                <strong style="color:#8b5cf6;">{sender_name}</strong> has shared a new question bank with you:
              </p>

              <!-- Bank details card -->
              <div style="background:#fdf2f8;border:1.5px solid #fbcfe8;border-radius:12px;padding:24px;margin-bottom:24px;text-align:left;">
                <p style="margin:0 0 8px;font-size:12px;color:#db2777;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Question Bank Details
                </p>
                <h2 style="margin:0 0 8px;font-size:20px;color:#1e293b;font-weight:800;line-height:1.3;">{bank_title}</h2>
                <p style="margin:0;font-size:14px;color:#475569;font-weight:500;">Subject: {subject_code} — {subject_name}</p>
              </div>

              <p style="margin:24px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
                The question bank Excel file has been generated and attached to this email for your convenience.
              </p>

              <!-- AI Disclaimer -->
              <div style="margin-top: 28px; padding: 16px; background-color: #fffbeb; border-left: 4px solid #fbbf24; border-radius: 8px;">
                <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                  <strong>⚠️ Note:</strong> Krish Academia AI can make mistakes. Please verify the generated questions before using them.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;">
                Krish Academia — AI-Powered Question Bank Generator
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">
                © 2026 Krish Academia. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div style="display:none; color:transparent; font-size:0px;">{time.time()}</div>
</body>
</html>"""


def _send_html_email(recipient: str, subject: str, html_body: str) -> bool:
    if not _smtp_configured():
        return False
    return _send_email_core(recipient, subject, html_body)

def _send_email_core(recipient: str, subject: str, html_body: str, attachment_path: Optional[str] = None) -> bool:
    provider = settings.EMAIL_PROVIDER.lower()

    # 1. Use Brevo HTTP API to bypass Render firewall blocks.
    #    IMPORTANT: the REST API authenticates with the Brevo *API key*
    #    ('xkeysib-...'), which is NOT the same as the SMTP key in SMTP_PASS
    #    ('xsmtpsib-...'). Passing the SMTP key here returns HTTP 401.
    if provider == 'brevo' and not settings.BREVO_API_KEY:
        logger.error(
            "[EmailService] EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set. "
            "The Brevo REST API needs an API key starting with 'xkeysib-' "
            "(Brevo dashboard → SMTP & API → API Keys) — this is different from the "
            "SMTP key in SMTP_PASS ('xsmtpsib-'). Set BREVO_API_KEY in your environment. "
            "Falling back to SMTP, which is blocked on Render."
        )
    if provider == 'brevo' and settings.BREVO_API_KEY:
        try:
            url = "https://api.brevo.com/v3/smtp/email"
            headers = {
                "accept": "application/json",
                "api-key": settings.BREVO_API_KEY,
                "content-type": "application/json"
            }
            payload = {
                "sender": {"name": settings.FROM_NAME, "email": settings.FROM_EMAIL},
                "to": [{"email": recipient}],
                "subject": subject,
                "htmlContent": html_body
            }
            
            if attachment_path and os.path.exists(attachment_path):
                with open(attachment_path, "rb") as f:
                    file_content = base64.b64encode(f.read()).decode("utf-8")
                payload["attachment"] = [{
                    "content": file_content,
                    "name": os.path.basename(attachment_path)
                }]
                
            response = httpx.post(url, json=payload, headers=headers, timeout=30.0)
            response.raise_for_status()
            logger.info(f"[EmailService] HTTP API Sent email to {recipient}")
            return True
        except Exception as e:
            logger.error(f"[EmailService] HTTP API failed for {recipient}: {e}")
            if hasattr(e, 'response') and getattr(e, 'response') is not None:
                logger.error(f"[EmailService] Brevo API Response: {getattr(e, 'response').text}")
            return False

    # 2. Fallback to standard SMTP
    try:
        msg = MIMEMultipart("mixed")
        msg["From"] = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg["To"] = recipient
        msg["Subject"] = subject
        
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(alt)
        
        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, "rb") as f:
                part = MIMEBase("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=os.path.basename(attachment_path))
            msg.attach(part)

        with _get_smtp_server() as server:
            server.sendmail(settings.FROM_EMAIL, recipient, msg.as_string())
            
        logger.info(f"[EmailService] SMTP Sent email to {recipient}")
        return True
    except Exception as e:
        logger.error(f"[EmailService] SMTP failed for {recipient}: {e}")
        return False


def send_user_welcome_email(recipient_email: str, name: str, password: str, role: str, department: str) -> bool:
    """Send welcome email to a new user with their login credentials."""
    subject = "🎉 Welcome to Krish Academia — Account Created"
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Krish Academia</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(139, 92, 246, 0.06); border: 1px solid #f1f5f9;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);padding:40px 32px;text-align:center;">
              <!-- LOGO -->
              <img src="{settings.LOGO_URL}?v={int(time.time())}" alt="Krish Academia" height="75" style="display:block;margin:0 auto 16px;height:75px;width:auto;max-width:240px;border:0;outline:none;text-decoration:none;" />
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.3;">
                🎉 Account Created
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;">
                Welcome to Krish Academia!
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.6;font-weight:500;">
                Hello {name} 👋,
              </p>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                An administrator has created a new account for you on <strong>Krish Academia</strong>. You can log in using the credentials below:
              </p>

              <!-- Credentials block -->
              <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:12px;padding:24px;margin-bottom:24px;text-align:left;">
                <p style="margin:0 0 12px;font-size:12px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Login Credentials
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;" width="100">Email:</td>
                    <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:500;">{recipient_email}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">Password:</td>
                    <td style="padding:6px 0;font-size:14px;color:#1e293b;"><code style="background:#ddd6fe;color:#5b21b6;padding:4px 8px;border-radius:6px;font-weight:bold;font-family:monospace;">{password}</code></td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">Role:</td>
                    <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:500;">{role}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">Department:</td>
                    <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:500;">{department or '-'}</td>
                  </tr>
                </table>
              </div>

              <!-- Login Button -->
              <div style="text-align:center; margin-bottom: 24px;">
                <a href="https://krish-cs.github.io/QUESTION-MIND-FRONTEND/" style="display:inline-block; background-color:#8b5cf6; color:#ffffff; font-weight:600; font-size:15px; text-decoration:none; padding:12px 24px; border-radius:8px; box-shadow:0 4px 6px rgba(139, 92, 246, 0.25);">Login to Krish Academia</a>
              </div>

              <!-- Security Warning -->
              <div style="margin-top: 24px; padding: 16px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 8px;">
                <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.5;">
                  <strong>🔒 Security Notice:</strong> For security reasons, please log in to your account and change your password immediately.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;">
                Krish Academia — AI-Powered Question Bank Generator
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">
                © 2026 Krish Academia. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div style="display:none; color:transparent; font-size:0px;">{time.time()}</div>
</body>
</html>"""
    return _send_html_email(recipient_email, subject, html_body)


def send_user_update_email(recipient_email: str, name: str, changes: dict) -> bool:
    """Send email notification about changes to user details."""
    subject = "🔒 Krish Academia — Account Details Updated"
    
    # Render changes
    changes_html = ""
    for field, (old_val, new_val) in changes.items():
        changes_html += f"""
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#475569;">{field.capitalize()}</td>
          <td style="padding:12px 16px;font-size:14px;color:#94a3b8;text-decoration:line-through;">{old_val or '-'}</td>
          <td style="padding:12px 16px;font-size:14px;color:#10b981;font-weight:700;">{new_val or '-'}</td>
        </tr>
        """

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Details Updated</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(139, 92, 246, 0.06); border: 1px solid #f1f5f9;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);padding:40px 32px;text-align:center;">
              <!-- LOGO -->
              <img src="{settings.LOGO_URL}?v={int(time.time())}" alt="Krish Academia" height="75" style="display:block;margin:0 auto 16px;height:75px;width:auto;max-width:240px;border:0;outline:none;text-decoration:none;" />
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.3;">
                🔒 Details Updated
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;">
                Your account details were updated by an administrator.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.6;font-weight:500;">
                Hello {name} 👋,
              </p>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                An administrator has updated your profile details. Below is the list of changes made to your account:
              </p>

              <!-- Changes Table -->
              <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;box-shadow:0 4px 12px rgba(0,0,0,0.01);">
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <thead>
                    <tr style="background:#fdf2f8;text-align:left;">
                      <th style="padding:12px 16px;font-size:13px;font-weight:700;color:#db2777;border-bottom:1.5px solid #fbcfe8;">Field</th>
                      <th style="padding:12px 16px;font-size:13px;font-weight:700;color:#db2777;border-bottom:1.5px solid #fbcfe8;">Previous Value</th>
                      <th style="padding:12px 16px;font-size:13px;font-weight:700;color:#db2777;border-bottom:1.5px solid #fbcfe8;">New Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes_html}
                  </tbody>
                </table>
              </div>

              <!-- Login Button -->
              <div style="text-align:center; margin-bottom: 24px;">
                <a href="https://krish-cs.github.io/QUESTION-MIND-FRONTEND/" style="display:inline-block; background-color:#8b5cf6; color:#ffffff; font-weight:600; font-size:15px; text-decoration:none; padding:12px 24px; border-radius:8px; box-shadow:0 4px 6px rgba(139, 92, 246, 0.25);">Review Your Account</a>
              </div>

              <!-- Admin Contact Warning -->
              <div style="margin-top:24px;padding:16px;background-color:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;">
                <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.5;">
                  <strong>🚨 Did not expect this?</strong> If you did not authorize or expect these changes, please contact your administrator immediately.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;">
                Krish Academia — AI-Powered Question Bank Generator
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">
                © 2026 Krish Academia. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div style="display:none; color:transparent; font-size:0px;">{time.time()}</div>
</body>
</html>"""
    return _send_html_email(recipient_email, subject, html_body)


def send_user_password_reset_email(recipient_email: str, name: str, new_password: str) -> bool:
    """Send new password email to user after a password reset."""
    subject = "🔑 Krish Academia — Password Reset Successful"
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(139, 92, 246, 0.06); border: 1px solid #f1f5f9;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);padding:40px 32px;text-align:center;">
              <!-- LOGO -->
              <img src="{settings.LOGO_URL}?v={int(time.time())}" alt="Krish Academia" height="75" style="display:block;margin:0 auto 16px;height:75px;width:auto;max-width:240px;border:0;outline:none;text-decoration:none;" />
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.3;">
                🔑 Password Reset
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;">
                Your password has been successfully reset.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.6;font-weight:500;">
                Hello {name} 👋,
              </p>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                An administrator has reset your password. You can now log in using the temporary password below:
              </p>

              <!-- Password display box -->
              <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
                <p style="margin:0 0 10px;font-size:12px;color:#b45309;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Temporary Password
                </p>
                <code style="background:#fef3c7;color:#b45309;padding:6px 16px;border-radius:8px;font-size:20px;font-weight:800;font-family:monospace;letter-spacing:1px;display:inline-block;">{new_password}</code>
              </div>

              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                For security reasons, we strongly recommend logging in and changing this temporary password immediately.
              </p>

              <!-- Login Button -->
              <div style="text-align:center; margin-bottom: 24px;">
                <a href="https://krish-cs.github.io/QUESTION-MIND-FRONTEND/" style="display:inline-block; background-color:#8b5cf6; color:#ffffff; font-weight:600; font-size:15px; text-decoration:none; padding:12px 24px; border-radius:8px; box-shadow:0 4px 6px rgba(139, 92, 246, 0.25);">Login Now</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;">
                Krish Academia — AI-Powered Question Bank Generator
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">
                © 2026 Krish Academia. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div style="display:none; color:transparent; font-size:0px;">{time.time()}</div>
</body>
</html>"""
    return _send_html_email(recipient_email, subject, html_body)

# Question Mind Setup

This ZIP contains the source code and project configuration. Dependency folders, build output, uploads, data, Git history, secret folders, and `.env` files were excluded.

## Prerequisites

- Node.js and npm
- Python 3.10+ and pip
- Android Studio and Android SDK, only if the mobile app is needed

## Root dependencies

```powershell
npm install
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Python backend

```powershell
cd backend-python
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Copy `backend-python\.env.example` to `backend-python\.env` and fill in local values. Do the same for frontend or mobile `.env.example` files when required.

## Mobile app

```powershell
cd mobile-app
npm install
```

Open `mobile-app` in Android Studio for Android builds, or follow its README for Capacitor commands. Update localhost URLs when testing on a physical phone.

Read the included `README.md` files before starting services. Never share real credentials, API keys, private keys, or user data.
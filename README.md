# LiveTax Agent

Voice-first Gemini Live tax assistant with a Next.js frontend and a FastAPI websocket relay backend.

## Local setup

Frontend:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
gcloud config set project YOUR_PROJECT_ID
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
uvicorn main:app --host 127.0.0.1 --port 8000
```

The frontend expects the backend websocket at `ws://127.0.0.1:8000/ws` by default.

## Required environment

Backend:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION` optional, defaults to `us-central1`
- `GEMINI_LIVE_MODEL` optional, defaults to `gemini-live-2.5-flash-native-audio`
- `ALLOWED_ORIGINS` optional

Frontend:

- `NEXT_PUBLIC_BACKEND_WS_URL` optional, defaults to `ws://127.0.0.1:8000/ws`

## Current architecture

- Next.js frontend renders the voice workspace and the IRS Form 1040 PDF.
- Browser microphone audio is captured with an `AudioWorklet`.
- Audio, text, and dropped files stream to a FastAPI websocket backend.
- Backend owns the Gemini Live session and relays:
  - input transcription
  - output transcription
  - streamed audio
  - session status

## Notes

- The backend authenticates with Vertex AI through Application Default Credentials.
- The right pane currently shows the source PDF; live PDF field-filling is the next layer to wire.

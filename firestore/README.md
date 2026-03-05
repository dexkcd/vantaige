# Firestore Setup

VantAIge uses **Cloud Firestore** for all persistent data: vibe profiles, session logs, marketing plans, and brand assets.

## Create the Firestore database (required)

If you see `Error 5 NOT_FOUND`, the Firestore database does not exist yet. Create it:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your GCP project (or [add Firebase to it](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project))
3. In the sidebar: **Build** → **Firestore Database**
4. Click **Create database**
5. Choose a location (e.g. `us-central1`) and **Production mode** (server-only access)
6. Click **Enable**

## Prerequisites

- A Google Cloud project with the same `GOOGLE_CLOUD_PROJECT` used for Vertex AI
- Firebase added to your project (if not already)

## Collections

| Collection        | Document ID          | Purpose                                  |
|-------------------|----------------------|------------------------------------------|
| `sessions`       | `session_id` (UUID)   | Passcode-based session lookup; maps passcode to session scope |
| `vibe_profiles`   | `brand_id` (e.g. `session_id`) | Brand identity / vibe profile per session |
| `session_logs`    | Auto-generated       | Session summaries (scoped by `brand_id` = session_id) |
| `marketing_plans` | Auto-generated       | Kanban tasks / marketing plans (scoped by session) |
| `brand_assets`    | Auto-generated       | Generated images + prompts               |
| `short_videos`    | Auto-generated       | Short-form videos (TikTok/YouTube Shorts) |

### Session Management

Sessions use a passcode (6 alphanumeric characters) for restore:

1. **New Session**: Creates a session doc with `{ passcode, created_at }`; returns `session_id` and `passcode`. All documents (vibe profiles, session logs, marketing plans, brand assets, short videos) are owned by `session_id`.
2. **Continue Session**: User enters passcode; lookup `sessions.where('passcode', '==', input)` returns the session doc; `session_id` (doc id) is used as the scope for all data.

## Authentication

The Firebase Admin SDK picks credentials in this order:

1. **`GOOGLE_APPLICATION_CREDENTIALS_JSON`** or **`FIREBASE_SERVICE_ACCOUNT_KEY`** – Full JSON string of the service account key (recommended for deployment; no file path needed)
2. **`FIREBASE_SERVICE_ACCOUNT_PATH`** or **`GOOGLE_APPLICATION_CREDENTIALS`** – Path to a service account JSON file (for local dev)
3. **Application Default Credentials** – On Cloud Run / GCP or after `gcloud auth application-default login` (can fail with Workspace accounts)

### Deployment (Cloud Run, Docker, etc.)

Use a JSON string so you don't ship credential files. Store the value in Secret Manager or your deployment platform's secrets, then inject as an env var:

```bash
# In .env or Cloud Run env vars – paste the entire JSON from your service account key
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account","project_id":"your-project",...}'
```

### Local development (avoiding invalid_rapt)

If you see `invalid_grant` / `invalid_rapt`, use a service account instead of ADC:

```bash
# Option A: JSON string in .env.local (paste the full key)
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'

# Option B: Path to file
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa-firestore.json
```

## Deploy indexes

Composite indexes are required for queries that filter by `brand_id` and order by `created_at`. Deploy them with the Firebase CLI:

```bash
firebase deploy --only firestore:indexes
```

Or create indexes manually in the Firebase Console when Firestore suggests them on first query.

## Migrating from Supabase

If you have existing data in Supabase, you’ll need to:

1. Export data from Supabase (pg_dump or custom script)
2. Transform rows to Firestore document shape
3. Import into Firestore (e.g. via Admin SDK script or Firebase CLI)

See `supabase/setup.sql` for the previous schema reference.

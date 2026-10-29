# SketchSense API

Express API for OpenAI transcription and image refinement. See the repository root README for setup and endpoint contracts.

## MongoDB Atlas case persistence

1. Create a MongoDB Atlas cluster and database user, then allow the backend host's IP in Atlas Network Access.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to your real Atlas connection string. Set `MONGODB_DATABASE=sketchsense` (or your preferred database name).
3. Install backend dependencies with `npm install` and start with `npm run dev`.
4. Open `http://localhost:8787/api/health`. When configured, the JSON response includes `"database": true`.

The workspace automatically loads a case by its Case ID and saves changes after a short pause. The API supports `GET /api/cases`, `GET /api/cases/:caseId`, and `PUT /api/cases/:caseId`. Do not commit `.env` or expose the MongoDB URI in frontend environment variables. This MVP does not yet implement investigator authentication/authorization; do not deploy it publicly with real sensitive records until that is added. Embedded generated images count toward MongoDB's document-size limit; the API rejects oversized case records with a clear error.

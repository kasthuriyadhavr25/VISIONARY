# VISIONARY AI — Composite Studio

VISIONARY is an AI-assisted facial composite workspace with witness interview capture, structured facial attributes, editable illustrative composites, case history, and MongoDB-backed case persistence.

## Project layout
- `frontend/` — React, TypeScript and Vite UI
- `backend/` — Express API and MongoDB persistence

## Run locally
1. Configure `backend/.env` using `backend/.env.example` and your MongoDB connection string.
2. In `backend/`, run `npm install` then `npm run dev`.
3. In `frontend/`, run `npm install` then `npm run dev`.

Do not commit `.env` or expose database credentials in frontend code. Before storing real sensitive records, add authentication, role-based access controls and appropriate audit/retention policies. AI-generated composites are investigative aids, not identity verification.

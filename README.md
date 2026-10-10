# PulseMatch

Swipe-based UNC Chapel Hill event discovery. Built on TanStack Start + React + TypeScript + Tailwind v4.

## Run locally
```
bun install
cp .env.example .env   # fill what you have; everything is optional
bun run dev            # http://localhost:8080
bun run test           # dedupe, expiry, persistence, ranking, overlaps
```

## How events get in
- Server function `listEvents` imports from Heel Life JSON (`/api/discovery/event/search`, undocumented → isolated adapter, 3×50 pages max, 8s timeout), falls back to the RSS feed, then to a labeled demo dataset.
- Results are cached in server memory for 15 min (never fetched per swipe). Ended/cancelled events are dropped, duplicates merged by source + source ID.
- Manual re-import: open `/admin` and enter `ADMIN_IMPORT_TOKEN`. Without that secret, import is disabled server-side.
- Note: the default store is per server instance (in-memory). `supabase/schema.sql` is the proposed database version.

## Demo mode
No sign-up. Swipes, saved events, plan and preferences live in localStorage (`pulsematch:v1`) behind `UserStateStorage`.

## Integrations
| | Status |
|---|---|
| Heel Life JSON + RSS | Implemented |
| Recommendations (weighted category/tag) | Implemented |
| Assistant (rule-based, grounded in stored events) | Implemented |
| Gemini enrichment | Adapter implemented, needs `GEMINI_API_KEY`; not yet called by importer |
| ElevenLabs "Listen to my plan" | Implemented, needs `ELEVENLABS_API_KEY`; shows text itinerary otherwise |
| Photon messaging | Scaffolded interface only |
| Reminders | Opt-in preference stored; no delivery provider |
| Event suggestions / review queue | Not built |
| Auth + DB persistence | Not built (schema proposed) |

See `CONTRACTS.md` and `TEAM.md`.

# PulseMatch iMessage agent (Photon Spectrum)

Texts in, club chats out — one place for every club instead of scattered group chats.

1. Sign up at https://app.photon.codes/dashboard (promo `HACKWITHPHOTON`) → get `PROJECT_SECRET`. Our project ID is `440f4b28-11a2-46d8-b24a-5dc0d7f5452f` (already set in `index.ts`).
2. Add a phone number to your Photon account (avatar menu, top-right) — Spectrum can't enroll you on the project until you do.
3. Set the website secret `PHOTON_AGENT_TOKEN`; use the same value here.
4. `cd agent && bun install`
5. `PROJECT_SECRET=… PULSEMATCH_URL=https://<site> PHOTON_AGENT_TOKEN=… bun run index.ts`

Alternative: scaffold a fresh Spectrum project with `bun create spectrum-project@latest pulsematch --projectId 440f4b28-11a2-46d8-b24a-5dc0d7f5452f --providers imessage --yes` (writes a .env with credentials), then copy our `index.ts` logic into it.

Commands people can text: `join CODE Name`, `ask what's on tonight`, `alerts on|off`, `CODE message`, `help`.
Anything else posts to the sender's most recent club. Website messages are mirrored back every ~5s.

Note: the Spectrum message field names used in `index.ts` (`sender.id`, `text`, `space.send`) should be checked against docs.photon.codes once you have access.

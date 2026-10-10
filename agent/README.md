# PulseMatch iMessage agent (Photon Spectrum)

Texts in, club chats out — one place for every club instead of scattered group chats.

1. Sign up at https://app.photon.codes/dashboard (promo `HACKWITHPHOTON`) → get `PROJECT_ID` and `PROJECT_SECRET`.
2. Set the website secret `PHOTON_AGENT_TOKEN`; use the same value here.
3. `cd agent && bun install`
4. `PROJECT_ID=… PROJECT_SECRET=… PULSEMATCH_URL=https://<site> PHOTON_AGENT_TOKEN=… bun run index.ts`

Commands people can text: `join CODE Name`, `ask what's on tonight`, `alerts on|off`, `CODE message`, `help`.
Anything else posts to the sender's most recent club. Website messages are mirrored back every ~5s.

Note: the Spectrum message field names used in `index.ts` (`sender.id`, `text`, `space.send`) should be checked against docs.photon.codes once you have access.

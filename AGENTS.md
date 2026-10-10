<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Shared models live only in `src/shared/types.ts`; modules import from there so four teammates can work in parallel.
- Feature code lives in `src/modules/<area>/` (ingestion, discovery, recommendations, plan, assistant); routes stay thin.
- External event sources are `SourceAdapter`s tried in order; the undocumented Heel Life JSON API must stay isolated behind its adapter.
- User state goes through `UserStateStorage` (localStorage today) so authenticated persistence can replace it without UI changes.
- Provider keys (Gemini, ElevenLabs, admin token) are read only inside server function handlers; unconfigured integrations return an explicit "unconfigured" status, never fake success.
- Visual styling uses the aero utilities in `src/styles.css` (aero-btn, aero-panel, aero-solid, bubble); components don't hardcode colors.

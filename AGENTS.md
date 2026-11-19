# Tinted

A LiquidBounce theme: Svelte 5 with runes, TypeScript, Vite, bun. `bun run check` must pass before a commit.

## AI provenance

[agent-usage](https://github.com/1zun4/agent-usage) (v1.2.0, run in CI) keeps what the models cost in
`.agent-usage/` and checks the `@agent` tags.

- Every commit made with an AI model adds its own file to `.agent-usage/`, recorded from the session logs of that
  commit. Never edit or delete an existing one.
- Every class, interface, enum or top-level function a model wrote carries `@agent <model>` as the last tag of its
  JSDoc, naming the model that writes it. No other doc: `/** @agent claude-opus-5-5 */` on its own. A Svelte
  component carries it as the first line of its instance `<script>`.
- A model that later changes a function's logic adds its own tag; several models get one tag each, oldest first.
  Renames, imports, formatting and moves add none. Tags move with the code.
- Model ids as the provider names them, without provider prefix: `claude-opus-5-5`, `gpt-5.6-sol`.
- Code people wrote with AI only assisting gets no tag. Code taken from elsewhere keeps the tags it had there.

```sh
curl -fsSLo /tmp/agent-usage https://raw.githubusercontent.com/1zun4/agent-usage/v1.2.0/agent-usage
python3 /tmp/agent-usage record <session log or folder> --from <first call of the change> --change "<commit subject>"
python3 /tmp/agent-usage check --style '*.svelte=block'
```

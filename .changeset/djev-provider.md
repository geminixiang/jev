---
"@geminixiang/jev": minor
---

Add a `djev` provider for self-hosted djev-spark boxes (DiffusionGemma serving TypeSafe's `/v1/systemone`). `djevProvider({ baseUrl, apiKey?, id? })` is created explicitly like a custom provider — a self-hosted endpoint has no fixed address — and is keyless by default, matching the server; `DJEV_API_KEY` / `DJEV_BASE_URL` override per environment, and a custom `id` allows several boxes side by side. `JevRequest` gains the server's optional extensions (`seed`, `samples`, `think`, `instructions`, `chunk_rows`, `chunk_prompt`, `sequential`, `ask`, `steps`, `images`), questions gain `depends_on` / `ask_if` / `alone`, and an `ask_if`-gated question's answer is typed `Answer | null` since the server skips it with `null`. Cloud wire implementations are unchanged and never send the extensions.

// Inside a Cloudflare Worker with an `AI` binding in wrangler.toml.
import { JevClient, cloudflareBindingProvider, noul } from "jev-sdk";

interface Env {
  AI: { run(model: string, input: unknown): Promise<unknown> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const jev = new JevClient(cloudflareBindingProvider({ binding: env.AI }));
    const text = await req.text();
    const spam = await jev.ask(text, noul("Is this message spam?"));
    return Response.json({ spam: spam.noul });
  },
};

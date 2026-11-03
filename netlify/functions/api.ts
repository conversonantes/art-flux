// The whole API as one Netlify Function, served under /api/*.
// All the logic is in apps/api; this only wires it to the environment of the site.
import { createApp } from "../../apps/api/src/app";
import { netlifyHandler } from "../../apps/api/src/netlify";
import { wiringFromEnv } from "../../apps/api/src/wiring";

const app = createApp(wiringFromEnv(process.env).wiring);

export default netlifyHandler(app);

export const config = { path: "/api/*" };

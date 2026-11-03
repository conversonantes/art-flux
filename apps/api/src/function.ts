// The whole API as one Netlify Function, served under /api/*.
// All the logic is in this package; this only wires it to the environment of the site.
// Netlify does not run this file as it is: `pnpm build:api` (scripts/build-function.mjs) bundles it,
// dependencies included, into netlify/functions/api.mjs.
import { createApp } from "./app";
import { netlifyHandler } from "./netlify";
import { wiringFromEnv } from "./wiring";

const app = createApp(wiringFromEnv(process.env).wiring);

export default netlifyHandler(app);

export const config = { path: "/api/*" };

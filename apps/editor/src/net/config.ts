/**
 * Resolved at build time by Vite. In dev (Vite proxy / localhost), the values
 * fall back to `http://localhost:5174` and `ws://localhost:5174` so existing
 * `npm run dev` workflows keep working. In production Vercel builds set:
 *
 *   VITE_GENEX_SERVER=https://genex-server.koyeb.app
 *   VITE_GENEX_WS=wss://genex-server.koyeb.app
 *
 * (Both can be the same host; WS just needs the `wss://` scheme.)
 */
const env = import.meta.env;

const RAW_HTTP =
  (env.VITE_GENEX_SERVER as string | undefined)?.trim() ||
  "http://localhost:5174";

const RAW_WS =
  (env.VITE_GENEX_WS as string | undefined)?.trim() ||
  RAW_HTTP.replace(/^http(s?):/, "ws$1:");

export const SERVER_HTTP = RAW_HTTP.replace(/\/+$/, "");
export const SERVER_WS = `${RAW_WS.replace(/\/+$/, "")}/ws`;

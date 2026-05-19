import type { WsServerMsg } from "@poc/shared";
import { useEditor } from "../state/store";
import { ORIGIN } from "./origin";
import { SERVER_WS } from "./config";

export function connectWs(projectId: string) {
  const ws = new WebSocket(SERVER_WS);
  ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", projectId }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data) as WsServerMsg;
    const st = useEditor.getState();
    switch (msg.type) {
      case "script:updated":
      case "script:created":
        // Always update the in-memory map: even our own edits should refresh
        // updatedAt so the hot-reload trigger fires. The runtime is keyed on
        // `updatedAt`, not on `origin`, so this is safe.
        st.upsertScript(msg.script);
        break;
      case "definition:updated":
        if (msg.origin === ORIGIN) break; // ignore our own echoes
        st.applyRemoteDefinition(msg.definition);
        break;
      case "cli:registered":
        st.setCliAbsPath(msg.absPath);
        break;
      case "cli:disconnected":
        st.setCliAbsPath(null);
        break;
      case "hello":
        break;
    }
  };
  ws.onclose = () => setTimeout(() => connectWs(projectId), 1000);
  return ws;
}

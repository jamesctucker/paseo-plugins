import type { PluginClientContext } from "@getpaseo/plugin";
import { setDiffTabOpener } from "./store.shared";

export function contributeDiffClient(client: PluginClientContext): () => void {
  return setDiffTabOpener((workspaceId) => {
    client.openPanel("diff-viewer", { workspaceId });
  });
}

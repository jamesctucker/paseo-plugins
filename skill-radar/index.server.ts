import type { PluginServerContext } from "@getpaseo/plugin/server";
import { classify } from "./server/classify";
import { scanSkills } from "./server/skills";
import { classifyContext, listSkills } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  server.handle(listSkills, async ({ refresh }) => {
    const catalog = await scanSkills(refresh ?? false);
    return catalog;
  });

  server.handle(classifyContext, async ({ messages }) => {
    const result = await classify(messages);
    const ranked = result.matches.map((match) => `${match.name} ${match.confidence}%`).join(", ");
    console.log(`Skill Radar: classify ${result.status}${ranked ? ` → ${ranked}` : ""}`);
    return result;
  });

  void scanSkills()
    .then((catalog) => {
      console.log(
        `Skill Radar: ${catalog.skills.length} skills from ${catalog.roots.length} roots` +
          (catalog.missingRoots.length ? `, missing ${catalog.missingRoots.join(", ")}` : ""),
      );
    })
    .catch((error) => console.error("Skill Radar: catalog scan failed", error));

  return () => {};
}

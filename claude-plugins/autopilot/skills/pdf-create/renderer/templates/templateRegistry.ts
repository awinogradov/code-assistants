import type { TemplateName } from "../schemas/contentSchema";
import { playbookTemplate } from "./playbookTemplate";
import { reportTemplate } from "./reportTemplate";
import { researchDocTemplate } from "./researchDocTemplate";
import { sixPagerTemplate } from "./sixPagerTemplate";
import type { TemplateComponent } from "./templateProps";

/** Maps a content `template` name to its component. */
export const templateRegistry: Record<TemplateName, TemplateComponent> = {
  report: reportTemplate,
  researchDoc: researchDocTemplate,
  sixPager: sixPagerTemplate,
  playbook: playbookTemplate,
};

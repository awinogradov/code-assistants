import type { ReactElement } from "react";

import type { PageNumberStore } from "../render/pageNumberStore";
import type { Content } from "../schemas/contentSchema";

export interface TemplateProps {
  content: Content;
  store: PageNumberStore;
}

export type TemplateComponent = (props: TemplateProps) => ReactElement;

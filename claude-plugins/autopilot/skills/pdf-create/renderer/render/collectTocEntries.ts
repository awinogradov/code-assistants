import type { Content, Section } from "../schemas/contentSchema";

export interface TocEntry {
  id: string;
  title: string;
  level: 1 | 2;
}

/** Flatten body sections and the appendix into an ordered list of TOC entries. */
export function collectTocEntries(content: Content): TocEntry[] {
  const entries = (sections: Section[]): TocEntry[] =>
    sections.map((section) => ({ id: section.id, title: section.title, level: section.tocLevel }));
  return [...entries(content.sections), ...entries(content.appendix)];
}

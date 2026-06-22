/**
 * Records the first page each section lands on during layout, so the table of
 * contents can print real page numbers.
 *
 * @react-pdf/renderer evaluates `render` callbacks during a layout pass before
 * the final pass. A probe inside each section writes its page here; TOC rows
 * read it back. Only the first page seen for an id is kept.
 */
export interface PageNumberStore {
  set(id: string, page: number): void;
  get(id: string): number | undefined;
}

export function createPageNumberStore(): PageNumberStore {
  const pages = new Map<string, number>();
  return {
    set(id, page) {
      if (!pages.has(id)) pages.set(id, page);
    },
    get(id) {
      return pages.get(id);
    },
  };
}

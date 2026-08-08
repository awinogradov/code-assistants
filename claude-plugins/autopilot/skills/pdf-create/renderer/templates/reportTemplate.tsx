import { Document, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { CoverPage } from "../components/CoverPage";
import { TableOfContents } from "../components/TableOfContents";
import { PageShell } from "../components/layout/PageShell";
import { Section } from "../components/layout/Section";
import { Heading } from "../components/primitives/Heading";
import { collectTocEntries } from "../render/collectTocEntries";
import type { TemplateProps } from "./templateProps";

/** General-purpose business report: cover, contents, sequential sections, appendix. */
export function reportTemplate({ content, store }: TemplateProps): ReactElement {
  const entries = collectTocEntries(content);
  return (
    <Document title={content.metadata.title} author={content.metadata.authors.join(", ")}>
      <CoverPage cover={content.cover} metadata={content.metadata} />
      <PageShell metadata={content.metadata}>
        {content.toc ? <TableOfContents entries={entries} store={store} /> : null}
        {content.sections.map((section) => (
          <Section key={section.id} section={section} store={store} />
        ))}
        {content.appendix.length > 0 ? (
          <View break>
            <Heading level={1}>Appendix</Heading>
            {content.appendix.map((section) => (
              <Section key={section.id} section={section} store={store} />
            ))}
          </View>
        ) : null}
      </PageShell>
    </Document>
  );
}

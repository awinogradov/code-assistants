import { Document, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { CoverPage } from "../components/CoverPage";
import { TableOfContents } from "../components/TableOfContents";
import { PageShell } from "../components/layout/PageShell";
import { Section } from "../components/layout/Section";
import { Heading } from "../components/primitives/Heading";
import { collectTocEntries } from "../render/collectTocEntries";
import type { TemplateProps } from "./templateProps";

/** Academic-style document: author-forward cover, numbered sections, references appendix. */
export function researchDocTemplate({ content, store }: TemplateProps): ReactElement {
  const entries = collectTocEntries(content);
  return (
    <Document title={content.metadata.title} author={content.metadata.authors.join(", ")}>
      <CoverPage cover={content.cover} metadata={content.metadata} />
      <PageShell metadata={content.metadata}>
        {content.toc ? <TableOfContents entries={entries} store={store} /> : null}
        {content.sections.map((section, index) => (
          <Section key={section.id} section={section} store={store} numberLabel={`${index + 1}.`} />
        ))}
        {content.appendix.length > 0 ? (
          <View break>
            <Heading level={1}>References</Heading>
            {content.appendix.map((section) => (
              <Section key={section.id} section={section} store={store} />
            ))}
          </View>
        ) : null}
      </PageShell>
    </Document>
  );
}

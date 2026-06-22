import { Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { Section as SectionData } from "../../schemas/contentSchema";
import type { PageNumberStore } from "../../render/pageNumberStore";
import { useTheme } from "../../theme/themeContext";
import { BlockRenderer } from "../BlockRenderer";
import { Heading } from "../primitives/Heading";

interface SectionProps {
  section: SectionData;
  store: PageNumberStore;
  level?: 1 | 2 | 3;
  /** Optional leading number, e.g. "2" or "2.1", prepended to the title. */
  numberLabel?: string;
  /** "banded" renders the title in a filled bar (used by the playbook template). */
  variant?: "plain" | "banded";
}

/**
 * A document section: a probe records its first page for the TOC, a bookmark adds
 * it to the outline, the `id` is its internal link target, then its blocks render.
 */
export function Section({
  section,
  store,
  level = 1,
  numberLabel,
  variant = "plain",
}: SectionProps): ReactElement {
  const theme = useTheme();
  const title = numberLabel ? `${numberLabel} ${section.title}` : section.title;
  return (
    <View id={section.id} bookmark={{ title }} style={{ marginBottom: theme.spacing.md }}>
      <Text
        style={{ height: 0, fontSize: 1 }}
        render={({ pageNumber }) => {
          store.set(section.id, pageNumber);
          return "";
        }}
      />
      {variant === "banded" ? (
        <View
          minPresenceAhead={theme.spacing.keepWithNext}
          style={{
            backgroundColor: theme.colors.primary,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.rounded.sm,
            marginTop: theme.spacing.lg,
            marginBottom: theme.spacing.sm,
          }}
        >
          <Text style={{ ...theme.text.h3, color: theme.colors.onPrimary }}>{title}</Text>
        </View>
      ) : (
        <Heading level={level}>{title}</Heading>
      )}
      {section.blocks.map((block, index) => (
        <BlockRenderer key={index} block={block} />
      ))}
    </View>
  );
}

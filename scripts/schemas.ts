import { z } from "zod";

const kebab = /^[a-z0-9]+(?:[-:][a-z0-9]+)*$/;
const semver = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;

export const marketplaceSchema = z.object({
  name: z.string().min(1),
  owner: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
  }),
  plugins: z
    .array(
      z.object({
        name: z.string().regex(kebab, "plugin name must be kebab-case"),
        source: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
});

export const pluginManifestSchema = z.object({
  name: z.string().regex(kebab, "plugin name must be kebab-case"),
  version: z.string().regex(semver, "version must be semver"),
  description: z.string().min(1),
  author: z.union([
    z.string().min(1),
    z.object({
      name: z.string().min(1),
      url: z.string().url().optional(),
    }),
  ]),
  repository: z.string().min(1).optional(),
});

// Skill/agent name slugs allow `:` separators (e.g. `pr:review`).
const skillName = z.string().regex(kebab, "name must be kebab-case (`:` allowed as separator)");

export const skillFrontmatterSchema = z.object({
  name: skillName,
  description: z.string().min(1),
  "argument-hint": z.string().optional(),
  "allowed-tools": z.array(z.string().min(1)).optional(),
  model: z.string().optional(),
});

export const agentFrontmatterSchema = z.object({
  name: skillName,
  description: z.string().min(1),
  model: z.string().optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
});

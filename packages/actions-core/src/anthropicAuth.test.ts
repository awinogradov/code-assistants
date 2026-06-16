import { describe, expect, test } from "bun:test";

import { assertExclusiveAnthropicAuth, exclusiveAnthropicAuthError } from "./anthropicAuth.ts";

describe("assertExclusiveAnthropicAuth", () => {
  test("throws when both api key and auth token are non-blank", () => {
    expect(() => assertExclusiveAnthropicAuth("k", "t")).toThrow(exclusiveAnthropicAuthError);
  });

  test("allows exactly one auth method, or none", () => {
    expect(() => assertExclusiveAnthropicAuth("k", undefined)).not.toThrow();
    expect(() => assertExclusiveAnthropicAuth(undefined, "t")).not.toThrow();
    expect(() => assertExclusiveAnthropicAuth(undefined, undefined)).not.toThrow();
  });

  test("treats blank or whitespace-only values as unset", () => {
    expect(() => assertExclusiveAnthropicAuth("k", "   ")).not.toThrow();
    expect(() => assertExclusiveAnthropicAuth("", "t")).not.toThrow();
  });
});

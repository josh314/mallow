// This module provides a utility for creating adhoc configurations for use within tests.
import type { Config } from "@schemas";

export function makeTestConfig( overrides: Partial<Config> = {} ): Config {
  return {
    port: 0,
    ...overrides
  } as Config;
}

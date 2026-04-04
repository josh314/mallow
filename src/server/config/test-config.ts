// This module provides a utility for creating adhoc configurations for use within tests.
import type { Config } from "@schemas";

export function makeTestConfig( overrides: Partial<Config> = {} ): Config {
  return {
    port: 9000,
    nodeEnv: 'test',
    sessionSecret: 'test-secret',
    db: {
      databaseUrl: 'postgres://user:password@localhost:5432/testdb',
      maxConnections: 10,
    },
    ...overrides
  } as Config;
}

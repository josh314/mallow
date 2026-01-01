import * as z from "zod";
import { envs } from "@types";

import { dbConfigSchema } from "../db/config";

/** Schema for contents of package.json */
export const PackageJson = z.object({
  version: z.string(),
});

/** schema for app config object */
export const configSchema = z.object( {

  nodeEnv: z.enum( envs ).default( 'development' ),

  port: z.coerce.number().int().positive(),

  db: dbConfigSchema,

} );

export type Config = z.infer<typeof configSchema>;

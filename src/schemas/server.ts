import * as z from "zod";
import { envs } from "@types";

export const configSchema = z.object( {

  nodeEnv: z.enum( envs ).default( 'development' ),

  port: z.coerce.number().int().positive(),

} );

export type Config = z.infer<typeof configSchema>;

import * as z from "zod";

export const configSchema = z.object( {

  nodeEnv: z.enum( [ 'development' , 'test' , 'production' ] ).default( 'development' ),

  port: z.coerce.number().int().positive(),

} );

export type Config = z.infer<typeof configSchema>;

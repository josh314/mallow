import { z } from "zod";

function buildDatabaseUrl( args: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} ): string {

  const { host, port, database, user, password } = args;

  const u = encodeURIComponent( user );
  const p = encodeURIComponent( password );

  return `postgres://${ u }:${ p }@${ host }:${ port }/${ database }`;

}

const discreteDbSchema = z.object( {

  host: z.string().min( 1 ),
  port: z.coerce.number().int().positive(),
  database: z.string().min( 1 ),
  user: z.string().min( 1 ),
  password: z.string().min( 1 ),

} );

export const dbConfigSchema = z.object( {

  // Prefer DATABASE_URL, but allow discrete vars.
  databaseUrl: z.string().min( 1 ).optional(),

  host: z.string().min( 1 ).optional(),
  port: z.coerce.number().int().positive().optional(),
  database: z.string().min( 1 ).optional(),
  user: z.string().min( 1 ).optional(),
  password: z.string().min( 1 ).optional(),

  maxConnections: z.coerce.number().int().positive().default( 10 ),

} )
  .superRefine( ( v, ctx ) => {

    const hasUrl = !!v.databaseUrl;

    const hasDiscrete =
      v.host && v.port && v.database && v.user && v.password;

    if( !hasUrl && !hasDiscrete ) {

      ctx.addIssue( {
        code: "custom",
        message: "Provide DATABASE_URL or all of POSTGRES_HOST/PORT/DB/USER/PASSWORD.",
      } );

    }

  } )
  .transform( ( v ) => {

    if( v.databaseUrl ) {

      return {
        databaseUrl: v.databaseUrl,
        maxConnections: v.maxConnections,
      };

    }

    const parsed = discreteDbSchema.parse( {
      host: v.host,
      port: v.port,
      database: v.database,
      user: v.user,
      password: v.password,
    } );

    return {
      databaseUrl: buildDatabaseUrl( parsed ),
      maxConnections: v.maxConnections,
    };

  } );

export type DbConfig = z.infer<typeof dbConfigSchema>;

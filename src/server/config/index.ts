import * as z from "zod";
import { configSchema , type Config } from '@schemas';

export function getConfig( env: NodeJS.ProcessEnv = process.env ): Config {

  const raw = {

    nodeEnv: env.NODE_ENV,
    port: env.PORT,

  };


  const parsed = configSchema.safeParse( raw );

  if( !parsed.success ) {

    const flattened = z.flattenError( parsed.error );

    throw flattened;

  }


  return parsed.data;

};
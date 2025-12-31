import * as z from "zod";

import { ConfigurationError } from '../util/errors';
import { configSchema , type Config } from '@schemas';

export function getConfig( env: NodeJS.ProcessEnv = process.env ): Config {

  const raw = {

    nodeEnv: env.NODE_ENV,
    port: env.PORT,

  };

  try {
    return configSchema.parse( raw );
  }
  catch( error ) {
    if( error instanceof z.ZodError ) {
      const flattened = z.flattenError( error );
      throw new ConfigurationError( flattened );
    }
    throw error;
  }


};
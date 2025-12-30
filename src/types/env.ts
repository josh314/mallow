export const envs = [ 'production', 'development', 'test' ] as const;

export type Env = typeof envs[ number ];

export function isEnv(key: string | undefined ): key is Env {
  if( !key ) {
    return false;
  }
  return ( envs as readonly string[] ).includes( key );
}
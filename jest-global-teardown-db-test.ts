import { execFileSync } from "node:child_process";

function run( ...args: string[] ) {
  execFileSync( "docker", args, { stdio: "inherit" } );
}

export default async function globalTeardown() {

  run( "compose", "rm", "-sf", "flyway_test" );
  run( "compose", "rm", "-sf", "db_test" );

}

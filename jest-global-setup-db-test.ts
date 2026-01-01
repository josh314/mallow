import dotenv from "dotenv";
import { execFileSync } from "node:child_process";

dotenv.config();

function run( ...args: string[] ) {
  execFileSync( "docker", args, { stdio: "inherit" } );
}

export default async function globalSetup() {

  run(
    "compose",
    "up",
    "-d",
    "--wait",
    "db_test",
  );

  run(
    "compose",
    "up",
    "--no-deps",
    "--abort-on-container-exit",
    "flyway_test",
  );

}

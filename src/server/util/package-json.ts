import fs from "fs";

import { PackageJson } from '@schemas';

const packageJson = PackageJson.parse(
  JSON.parse( fs.readFileSync('package.json', 'utf8') )
);

export default packageJson;
import * as z from "zod";

export type FlattenedZodError = ReturnType<typeof z.flattenError>;

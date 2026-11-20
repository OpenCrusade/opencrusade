import { z } from "zod";

// The page's security policy forbids building code from text. Tell the
// validation library not to try. This file is imported before anything
// that defines a schema, so the setting is in place first.
z.config({ jitless: true });

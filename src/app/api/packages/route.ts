import { ok, route } from "@/lib/api/http";
import * as packages from "@/services/packages";

// GET /api/packages  ->  active packages only, in display order
export const GET = route(async () => ok(await packages.listActive()));

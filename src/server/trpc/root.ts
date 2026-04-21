import { router } from "./init";
import { chatRouter } from "./routers/chat";
import { clientsRouter } from "./routers/clients";
import { orgRouter } from "./routers/org";
import { qboRouter } from "./routers/qbo";
import { reportsRouter } from "./routers/reports";

export const appRouter = router({
	org: orgRouter,
	clients: clientsRouter,
	qbo: qboRouter,
	reports: reportsRouter,
	chat: chatRouter,
});

export type AppRouter = typeof appRouter;

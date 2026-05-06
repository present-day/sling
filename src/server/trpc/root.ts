import { router } from "./init"
import { chatRouter } from "./routers/chat"
import { clientsRouter } from "./routers/clients"
import { monthEndCloseRouter } from "./routers/month-end-close"
import { orgRouter } from "./routers/org"
import { qboRouter } from "./routers/qbo"
import { reportsRouter } from "./routers/reports"
import { uploadsRouter } from "./routers/uploads"

export const appRouter = router({
	org: orgRouter,
	clients: clientsRouter,
	qbo: qboRouter,
	reports: reportsRouter,
	chat: chatRouter,
	monthEndClose: monthEndCloseRouter,
	uploads: uploadsRouter,
})

export type AppRouter = typeof appRouter

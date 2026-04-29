import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
	account,
	accountRelations,
	invitation,
	invitationRelations,
	member,
	memberRelations,
	organization,
	organizationRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./auth-schema";

export * from "./auth-schema";

export const clients = sqliteTable(
	"clients",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		realmId: text("realm_id").notNull(),
		environment: text("environment", { enum: ["sandbox", "production"] })
			.notNull()
			.default("sandbox"),
		encryptedRefreshToken: text("refresh_token_enc").notNull(),
		tokenUpdatedAt: integer("token_updated_at", {
			mode: "timestamp_ms",
		}).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		index("clients_org_idx").on(t.orgId),
		uniqueIndex("clients_org_realm_uidx").on(t.orgId, t.realmId),
	],
);

export const clientMembers = sqliteTable(
	"client_members",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => clients.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", {
			enum: ["admin", "bookkeeper", "client_viewer"],
		}).notNull(),
	},
	(t) => [
		index("client_members_client_idx").on(t.clientId),
		index("client_members_user_idx").on(t.userId),
		uniqueIndex("client_members_uidx").on(t.clientId, t.userId),
	],
);

export const reportTemplates = sqliteTable(
	"report_templates",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		kind: text("kind", {
			enum: ["profit_loss", "balance_sheet", "cash_flow", "custom"],
		}).notNull(),
		config: text("config", { mode: "json" }).notNull(),
		/** Original filename from upload (for display). */
		sourcePdfFileName: text("source_pdf_file_name"),
		/** Path under the app data dir, e.g. `.data/report-templates/{orgId}/{id}.pdf`. */
		sourcePdfStoragePath: text("source_pdf_storage_path"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [uniqueIndex("report_templates_org_slug_uidx").on(t.orgId, t.slug)],
);

export const chatThreads = sqliteTable(
	"chat_threads",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		clientId: text("client_id").references(() => clients.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title"),
		/** Optional context kind this thread is scoped to, e.g. a month-end close run. */
		contextKind: text("context_kind", { enum: ["month_end_close"] }),
		/** Opaque id of the context row (e.g. `month_end_closes.id`). */
		contextId: text("context_id"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		index("chat_threads_org_idx").on(t.orgId),
		index("chat_threads_user_idx").on(t.userId),
		index("chat_threads_context_idx").on(t.contextKind, t.contextId),
	],
);

export const chatMessages = sqliteTable(
	"chat_messages",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => chatThreads.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
		content: text("content", { mode: "json" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [index("chat_messages_thread_idx").on(t.threadId)],
);

export const monthEndCloses = sqliteTable(
	"month_end_closes",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		clientId: text("client_id")
			.notNull()
			.references(() => clients.id, { onDelete: "cascade" }),
		/** YYYY-MM-DD */
		periodStart: text("period_start").notNull(),
		/** YYYY-MM-DD */
		periodEnd: text("period_end").notNull(),
		accountingMethod: text("accounting_method", {
			enum: ["Accrual", "Cash"],
		}).notNull(),
		baselineKey: text("baseline_key").notNull(),
		status: text("status", { enum: ["open", "signed_off"] })
			.notNull()
			.default("open"),
		/** Snapshot of the current + baseline `PnlLine[]` keyed by baseline id. */
		inputSnapshot: text("input_snapshot", { mode: "json" }).notNull(),
		/** Structured findings produced by the detectors. */
		findings: text("findings", { mode: "json" }).notNull(),
		/** LLM-produced narrative + per-finding commentary + audit trail. */
		narrative: text("narrative", { mode: "json" }).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		index("month_end_closes_org_idx").on(t.orgId),
		index("month_end_closes_client_idx").on(t.clientId),
		index("month_end_closes_period_idx").on(
			t.clientId,
			t.periodStart,
			t.periodEnd,
		),
	],
);

export const monthEndFindingDispositions = sqliteTable(
	"month_end_finding_dispositions",
	{
		id: text("id").primaryKey(),
		closeId: text("close_id")
			.notNull()
			.references(() => monthEndCloses.id, { onDelete: "cascade" }),
		findingId: text("finding_id").notNull(),
		disposition: text("disposition", {
			enum: ["accepted", "dismissed", "noted"],
		}).notNull(),
		note: text("note"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("month_end_finding_dispositions_uidx").on(
			t.closeId,
			t.findingId,
		),
		index("month_end_finding_dispositions_close_idx").on(t.closeId),
	],
);

export const licenses = sqliteTable(
	"licenses",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.unique()
			.references(() => organization.id, { onDelete: "cascade" }),
		keyHash: text("key_hash").notNull(),
		plan: text("plan").notNull(),
		issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		maxClients: integer("max_clients").notNull().default(10),
	},
	(t) => [index("licenses_org_idx").on(t.orgId)],
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
	organization: one(organization, {
		fields: [clients.orgId],
		references: [organization.id],
	}),
	members: many(clientMembers),
}));

export const clientMembersRelations = relations(clientMembers, ({ one }) => ({
	client: one(clients, {
		fields: [clientMembers.clientId],
		references: [clients.id],
	}),
	user: one(user, {
		fields: [clientMembers.userId],
		references: [user.id],
	}),
}));

export const reportTemplatesRelations = relations(
	reportTemplates,
	({ one }) => ({
		organization: one(organization, {
			fields: [reportTemplates.orgId],
			references: [organization.id],
		}),
	}),
);

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
	organization: one(organization, {
		fields: [chatThreads.orgId],
		references: [organization.id],
	}),
	client: one(clients, {
		fields: [chatThreads.clientId],
		references: [clients.id],
	}),
	user: one(user, {
		fields: [chatThreads.userId],
		references: [user.id],
	}),
	messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	thread: one(chatThreads, {
		fields: [chatMessages.threadId],
		references: [chatThreads.id],
	}),
}));

export const licensesRelations = relations(licenses, ({ one }) => ({
	organization: one(organization, {
		fields: [licenses.orgId],
		references: [organization.id],
	}),
}));

export const monthEndClosesRelations = relations(
	monthEndCloses,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [monthEndCloses.orgId],
			references: [organization.id],
		}),
		client: one(clients, {
			fields: [monthEndCloses.clientId],
			references: [clients.id],
		}),
		createdBy: one(user, {
			fields: [monthEndCloses.createdByUserId],
			references: [user.id],
		}),
		dispositions: many(monthEndFindingDispositions),
	}),
);

export const monthEndFindingDispositionsRelations = relations(
	monthEndFindingDispositions,
	({ one }) => ({
		close: one(monthEndCloses, {
			fields: [monthEndFindingDispositions.closeId],
			references: [monthEndCloses.id],
		}),
		user: one(user, {
			fields: [monthEndFindingDispositions.userId],
			references: [user.id],
		}),
	}),
);

export const schema = {
	user,
	session,
	account,
	verification,
	organization,
	member,
	invitation,
	clients,
	clientMembers,
	reportTemplates,
	chatThreads,
	chatMessages,
	licenses,
	monthEndCloses,
	monthEndFindingDispositions,
	userRelations,
	sessionRelations,
	accountRelations,
	organizationRelations,
	memberRelations,
	invitationRelations,
	clientsRelations,
	clientMembersRelations,
	reportTemplatesRelations,
	chatThreadsRelations,
	chatMessagesRelations,
	licensesRelations,
	monthEndClosesRelations,
	monthEndFindingDispositionsRelations,
};

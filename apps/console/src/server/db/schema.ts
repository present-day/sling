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
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		index("chat_threads_org_idx").on(t.orgId),
		index("chat_threads_user_idx").on(t.userId),
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
};

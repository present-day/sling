"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"
import { type ChangeEvent, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveClientId } from "@/lib/active-client"
import { cn } from "@/lib/utils"
import {
	billDraftSchema,
	customerDraftSchema,
	invoiceDraftSchema,
	salesReceiptDraftSchema,
	vendorDraftSchema,
} from "@/server/uploads/translators/types"
import { trpc } from "@/trpc/react"
import type { CommitDraft } from "./dropzone-types"

type Errors = Record<string, string>
type AnyDraft = Record<string, unknown>

export function ReviewFields({
	entityKind,
	draft,
	onSubmit,
}: {
	entityKind: string
	draft: CommitDraft
	onSubmit: (next: CommitDraft) => void
}) {
	const [payload, setPayload] = useState<AnyDraft>(
		(draft as { payload: AnyDraft }).payload,
	)
	const [errors, setErrors] = useState<Errors>({})

	const schema = useMemo(() => schemaFor(entityKind), [entityKind])

	const handleSubmit = () => {
		// Round-trip the payload through the matching Zod schema so the server
		// receives a validated body. Field-level paths surface inline.
		const parsed = schema.safeParse(payload)
		if (!parsed.success) {
			const next: Errors = {}
			for (const issue of parsed.error.issues) {
				const path = issue.path.join(".")
				next[path] = issue.message
			}
			setErrors(next)
			return
		}
		// QBO rejects any Bill expense line without an AccountRef (fault 2020),
		// and only an account *id* (value) posts reliably — a name alone is not
		// enough. The schema leaves AccountRef optional, so gate it here.
		const billErrors = validateBillAccounts(entityKind, parsed.data)
		if (Object.keys(billErrors).length > 0) {
			setErrors(billErrors)
			return
		}
		setErrors({})
		onSubmit({ entityKind, payload: parsed.data } as CommitDraft)
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault()
				handleSubmit()
			}}
		>
			<KindFields
				entityKind={entityKind}
				draft={payload}
				setDraft={setPayload}
				errors={errors}
			/>
			<Button type="submit" className="self-end">
				Post to QuickBooks
			</Button>
		</form>
	)
}

function validateBillAccounts(entityKind: string, payload: unknown): Errors {
	if (entityKind !== "Bill") return {}
	const lines =
		((payload as { Line?: unknown }).Line as
			| Array<{
					AccountBasedExpenseLineDetail?: { AccountRef?: { value?: string } }
			  }>
			| undefined) ?? []
	const errors: Errors = {}
	lines.forEach((line, idx) => {
		if (!line.AccountBasedExpenseLineDetail?.AccountRef?.value) {
			errors[`Line.${idx}.Account`] = "Pick an expense account"
		}
	})
	return errors
}

function schemaFor(entityKind: string) {
	switch (entityKind) {
		case "SalesReceipt":
			return salesReceiptDraftSchema
		case "Invoice":
			return invoiceDraftSchema
		case "Customer":
			return customerDraftSchema
		case "Bill":
			return billDraftSchema
		case "Vendor":
			return vendorDraftSchema
		default:
			throw new Error(`No draft schema for entity kind: ${entityKind}`)
	}
}

function KindFields({
	entityKind,
	draft,
	setDraft,
	errors,
}: {
	entityKind: string
	draft: AnyDraft
	setDraft: (next: AnyDraft) => void
	errors: Errors
}) {
	switch (entityKind) {
		case "Bill":
			return <BillFields draft={draft} setDraft={setDraft} errors={errors} />
		case "Invoice":
		case "SalesReceipt":
			return (
				<SalesFields
					entityKind={entityKind}
					draft={draft}
					setDraft={setDraft}
					errors={errors}
				/>
			)
		case "Customer":
		case "Vendor":
			return (
				<NameListFields
					entityKind={entityKind}
					draft={draft}
					setDraft={setDraft}
					errors={errors}
				/>
			)
		default:
			return (
				<p className="text-sm text-ink-muted">No editor for {entityKind}.</p>
			)
	}
}

type BillLine = {
	Amount: number
	Description?: string
	AccountBasedExpenseLineDetail?: {
		AccountRef?: { name?: string; value?: string }
	}
	DetailType: "AccountBasedExpenseLineDetail"
}

function BillFields({
	draft,
	setDraft,
	errors,
}: {
	draft: AnyDraft
	setDraft: (next: AnyDraft) => void
	errors: Errors
}) {
	const clientId = useActiveClientId()
	const accountsQuery = trpc.qbo.listExpenseAccounts.useQuery(
		{ clientId: clientId ?? "" },
		{ enabled: clientId !== null },
	)
	const accounts = accountsQuery.data?.accounts ?? []

	const ref = (draft.VendorRef ?? {}) as { name?: string }
	const lines = (draft.Line ?? []) as BillLine[]
	const setLines = (next: BillLine[]) => setDraft({ ...draft, Line: next })

	return (
		<div className="flex flex-col gap-3">
			<Field
				label="Vendor"
				error={errors["VendorRef"] ?? errors["VendorRef.name"]}
			>
				<Input
					value={ref.name ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({ ...draft, VendorRef: { name: e.target.value } })
					}
					placeholder="Acme Office Supply"
				/>
			</Field>
			<Row>
				<Field label="Txn date" error={errors["TxnDate"]}>
					<Input
						type="date"
						value={(draft.TxnDate as string | undefined) ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({ ...draft, TxnDate: e.target.value || undefined })
						}
					/>
				</Field>
				<Field label="Due date" error={errors["DueDate"]}>
					<Input
						type="date"
						value={(draft.DueDate as string | undefined) ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({ ...draft, DueDate: e.target.value || undefined })
						}
					/>
				</Field>
			</Row>
			<Row>
				<Field label="Doc #" error={errors["DocNumber"]}>
					<Input
						value={(draft.DocNumber as string | undefined) ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({ ...draft, DocNumber: e.target.value || undefined })
						}
						placeholder="INV-1234"
					/>
				</Field>
				<Field label="Total amt" error={errors["TotalAmt"]}>
					<MoneyInput
						value={draft.TotalAmt as number | undefined}
						onChange={(v) => setDraft({ ...draft, TotalAmt: v })}
					/>
				</Field>
			</Row>
			<Field label="Memo" error={errors["PrivateNote"]}>
				<Input
					value={(draft.PrivateNote as string | undefined) ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({ ...draft, PrivateNote: e.target.value || undefined })
					}
				/>
			</Field>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="text-xs uppercase tracking-wide text-ink-muted">
						Line items
					</span>
					{errors["Line"] ? (
						<span className="text-xs text-negative">{errors["Line"]}</span>
					) : null}
				</div>
				{lines.map((line, idx) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within this form session
						key={idx}
						className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-raised p-2"
					>
						<Row>
							<Field label="Amount" error={errors[`Line.${idx}.Amount`]}>
								<MoneyInput
									value={line.Amount}
									onChange={(v) => {
										const next = [...lines]
										next[idx] = { ...line, Amount: v ?? 0 }
										setLines(next)
									}}
								/>
							</Field>
							<Field label="Account" error={errors[`Line.${idx}.Account`]}>
								<AccountSelect
									accounts={accounts}
									loading={accountsQuery.isLoading}
									value={
										line.AccountBasedExpenseLineDetail?.AccountRef?.value ?? ""
									}
									onChange={(value, name) => {
										const next = [...lines]
										next[idx] = {
											...line,
											AccountBasedExpenseLineDetail: value
												? { AccountRef: { value, name } }
												: undefined,
										}
										setLines(next)
									}}
								/>
							</Field>
						</Row>
						<Field label="Description">
							<Input
								value={line.Description ?? ""}
								onChange={(e: ChangeEvent<HTMLInputElement>) => {
									const next = [...lines]
									next[idx] = {
										...line,
										Description: e.target.value || undefined,
									}
									setLines(next)
								}}
							/>
						</Field>
						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setLines(lines.filter((_, i) => i !== idx))}
								disabled={lines.length === 1}
							>
								<Trash2Icon className="size-4" /> Remove
							</Button>
						</div>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() =>
						setLines([
							...lines,
							{ DetailType: "AccountBasedExpenseLineDetail", Amount: 0 },
						])
					}
					className="self-start"
				>
					<PlusIcon className="size-4" /> Add line
				</Button>
			</div>
		</div>
	)
}

function SalesFields({
	entityKind,
	draft,
	setDraft,
	errors,
}: {
	entityKind: "Invoice" | "SalesReceipt"
	draft: AnyDraft
	setDraft: (next: AnyDraft) => void
	errors: Errors
}) {
	const ref = (draft.CustomerRef ?? {}) as { name?: string }
	const lines = (draft.Line ?? []) as Array<{
		Amount: number
		Description?: string
		SalesItemLineDetail?: { Qty?: number; UnitPrice?: number }
		DetailType: "SalesItemLineDetail"
	}>
	const setLines = (
		next: Array<{
			Amount: number
			Description?: string
			SalesItemLineDetail?: { Qty?: number; UnitPrice?: number }
			DetailType: "SalesItemLineDetail"
		}>,
	) => setDraft({ ...draft, Line: next })

	return (
		<div className="flex flex-col gap-3">
			<Field
				label="Customer"
				error={errors["CustomerRef"] ?? errors["CustomerRef.name"]}
			>
				<Input
					value={ref.name ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({ ...draft, CustomerRef: { name: e.target.value } })
					}
					placeholder={
						entityKind === "Invoice" ? "Customer name (required)" : "Walk-in"
					}
				/>
			</Field>
			<Row>
				<Field label="Txn date" error={errors["TxnDate"]}>
					<Input
						type="date"
						value={(draft.TxnDate as string | undefined) ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({ ...draft, TxnDate: e.target.value || undefined })
						}
					/>
				</Field>
				{entityKind === "Invoice" ? (
					<Field label="Due date" error={errors["DueDate"]}>
						<Input
							type="date"
							value={(draft.DueDate as string | undefined) ?? ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) =>
								setDraft({ ...draft, DueDate: e.target.value || undefined })
							}
						/>
					</Field>
				) : (
					<Field label="Doc #" error={errors["DocNumber"]}>
						<Input
							value={(draft.DocNumber as string | undefined) ?? ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) =>
								setDraft({ ...draft, DocNumber: e.target.value || undefined })
							}
						/>
					</Field>
				)}
			</Row>
			{entityKind === "Invoice" ? (
				<Field label="Doc #" error={errors["DocNumber"]}>
					<Input
						value={(draft.DocNumber as string | undefined) ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({ ...draft, DocNumber: e.target.value || undefined })
						}
					/>
				</Field>
			) : null}
			<Field label="Memo" error={errors["PrivateNote"]}>
				<Input
					value={(draft.PrivateNote as string | undefined) ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({ ...draft, PrivateNote: e.target.value || undefined })
					}
				/>
			</Field>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="text-xs uppercase tracking-wide text-ink-muted">
						Line items
					</span>
					{errors["Line"] ? (
						<span className="text-xs text-negative">{errors["Line"]}</span>
					) : null}
				</div>
				{lines.map((line, idx) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within this form session
						key={idx}
						className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-raised p-2"
					>
						<Row>
							<Field label="Amount" error={errors[`Line.${idx}.Amount`]}>
								<MoneyInput
									value={line.Amount}
									onChange={(v) => {
										const next = [...lines]
										next[idx] = { ...line, Amount: v ?? 0 }
										setLines(next)
									}}
								/>
							</Field>
							<Field label="Qty">
								<Input
									type="number"
									inputMode="decimal"
									value={line.SalesItemLineDetail?.Qty ?? ""}
									onChange={(e: ChangeEvent<HTMLInputElement>) => {
										const v =
											e.target.value === "" ? undefined : Number(e.target.value)
										const next = [...lines]
										next[idx] = {
											...line,
											SalesItemLineDetail: {
												...(line.SalesItemLineDetail ?? {}),
												Qty: v,
											},
										}
										setLines(next)
									}}
								/>
							</Field>
						</Row>
						<Field label="Description">
							<Input
								value={line.Description ?? ""}
								onChange={(e: ChangeEvent<HTMLInputElement>) => {
									const next = [...lines]
									next[idx] = {
										...line,
										Description: e.target.value || undefined,
									}
									setLines(next)
								}}
							/>
						</Field>
						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setLines(lines.filter((_, i) => i !== idx))}
								disabled={lines.length === 1}
							>
								<Trash2Icon className="size-4" /> Remove
							</Button>
						</div>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() =>
						setLines([
							...lines,
							{ DetailType: "SalesItemLineDetail", Amount: 0 },
						])
					}
					className="self-start"
				>
					<PlusIcon className="size-4" /> Add line
				</Button>
			</div>
		</div>
	)
}

function NameListFields({
	entityKind,
	draft,
	setDraft,
	errors,
}: {
	entityKind: "Customer" | "Vendor"
	draft: AnyDraft
	setDraft: (next: AnyDraft) => void
	errors: Errors
}) {
	const email =
		((draft.PrimaryEmailAddr as { Address?: string } | undefined) ?? {})
			.Address ?? ""
	const phone =
		((draft.PrimaryPhone as { FreeFormNumber?: string } | undefined) ?? {})
			.FreeFormNumber ?? ""
	const addr = (draft.BillAddr ?? {}) as {
		Line1?: string
		City?: string
		CountrySubDivisionCode?: string
		PostalCode?: string
	}

	return (
		<div className="flex flex-col gap-3">
			<Field label={`${entityKind} display name`} error={errors["DisplayName"]}>
				<Input
					value={(draft.DisplayName as string | undefined) ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({ ...draft, DisplayName: e.target.value })
					}
				/>
			</Field>
			<Field label="Company name" error={errors["CompanyName"]}>
				<Input
					value={(draft.CompanyName as string | undefined) ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({ ...draft, CompanyName: e.target.value || undefined })
					}
				/>
			</Field>
			<Row>
				<Field label="Email" error={errors["PrimaryEmailAddr.Address"]}>
					<Input
						type="email"
						value={email}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							const v = e.target.value
							setDraft({
								...draft,
								PrimaryEmailAddr: v ? { Address: v } : undefined,
							})
						}}
					/>
				</Field>
				<Field label="Phone" error={errors["PrimaryPhone.FreeFormNumber"]}>
					<Input
						value={phone}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							const v = e.target.value
							setDraft({
								...draft,
								PrimaryPhone: v ? { FreeFormNumber: v } : undefined,
							})
						}}
					/>
				</Field>
			</Row>
			<Field label="Address line">
				<Input
					value={addr.Line1 ?? ""}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						setDraft({
							...draft,
							BillAddr: { ...addr, Line1: e.target.value || undefined },
						})
					}
				/>
			</Field>
			<Row>
				<Field label="City">
					<Input
						value={addr.City ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({
								...draft,
								BillAddr: { ...addr, City: e.target.value || undefined },
							})
						}
					/>
				</Field>
				<Field label="State">
					<Input
						value={addr.CountrySubDivisionCode ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({
								...draft,
								BillAddr: {
									...addr,
									CountrySubDivisionCode: e.target.value || undefined,
								},
							})
						}
					/>
				</Field>
				<Field label="Zip">
					<Input
						value={addr.PostalCode ?? ""}
						onChange={(e: ChangeEvent<HTMLInputElement>) =>
							setDraft({
								...draft,
								BillAddr: { ...addr, PostalCode: e.target.value || undefined },
							})
						}
					/>
				</Field>
			</Row>
		</div>
	)
}

function Field({
	label,
	error,
	children,
}: {
	label: string
	error?: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-1">
			<Label className="text-xs uppercase tracking-wide text-ink-muted">
				{label}
			</Label>
			{children}
			{error ? <span className="text-xs text-negative">{error}</span> : null}
		</div>
	)
}

function Row({ children }: { children: React.ReactNode }) {
	return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function AccountSelect({
	accounts,
	loading,
	value,
	onChange,
}: {
	accounts: Array<{ id: string; fullyQualifiedName: string }>
	loading: boolean
	value: string
	onChange: (value: string, name: string) => void
}) {
	return (
		<select
			className={cn(
				"h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
			)}
			value={value}
			disabled={loading}
			onChange={(e: ChangeEvent<HTMLSelectElement>) => {
				const id = e.target.value
				const acct = accounts.find((a) => a.id === id)
				onChange(id, acct?.fullyQualifiedName ?? "")
			}}
		>
			<option value="">
				{loading ? "Loading accounts…" : "Select an account…"}
			</option>
			{accounts.map((a) => (
				<option key={a.id} value={a.id}>
					{a.fullyQualifiedName}
				</option>
			))}
		</select>
	)
}

function MoneyInput({
	value,
	onChange,
}: {
	value: number | undefined
	onChange: (next: number | undefined) => void
}) {
	const [text, setText] = useState<string>(
		value === undefined ? "" : String(value),
	)
	return (
		<Input
			type="number"
			inputMode="decimal"
			step="0.01"
			className={cn("font-mono tabular-nums")}
			value={text}
			onChange={(e: ChangeEvent<HTMLInputElement>) => {
				const v = e.target.value
				setText(v)
				if (v === "") onChange(undefined)
				else {
					const n = Number(v)
					if (Number.isFinite(n)) onChange(n)
				}
			}}
		/>
	)
}

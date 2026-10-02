import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { appointments, appointmentEvents, shifts } from '$lib/server/db/schema';
import type { RequestEvent } from '@sveltejs/kit';

export const paymentStatuses = ['pending', 'paid', 'deposit_half'] as const;
export const appointmentStatuses = ['new', 'confirmed', 'completed', 'cancelled'] as const;
export const sources = ['call', 'instagram', 'website', 'recommendation', 'walk_in'] as const;

export const appointmentInput = z.object({
	clientName: z.string().trim().min(2, 'Укажите имя клиента').max(100),
	clientPhone: z.string().trim().regex(/^[+\d()\s-]{7,24}$/, 'Проверьте номер телефона'),
	serviceId: z.uuid(),
	salonId: z.uuid(),
	masterId: z.union([z.uuid(), z.literal('')]).default(''),
	comment: z.string().trim().max(1000).default(''),
	visitAt: z.iso.datetime({ offset: true }),
	paymentStatus: z.enum(paymentStatuses),
	price: z.coerce.number().int().min(0).max(10_000_000),
	source: z.enum(sources).default('call')
});

export const operatorInput = z.object({
	name: z.string().trim().min(2).max(80),
	login: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,32}$/, 'Логин: латиница, цифры, точка или подчёркивание'),
	password: z.string().min(8, 'Пароль должен содержать не менее 8 символов').max(128)
});

export function requireUser(event: RequestEvent) {
	if (!event.locals.user) redirect(303, '/login');
	return event.locals.user;
}

export function requireAdmin(event: RequestEvent) {
	const user = requireUser(event);
	if (user.role !== 'admin') error(403, 'Доступно только администратору');
	return user;
}

export async function getActiveShift(operatorId: string) {
	const [shift] = await db.select().from(shifts)
		.where(and(eq(shifts.operatorId, operatorId), isNull(shifts.endedAt)))
		.orderBy(sql`${shifts.startedAt} DESC`).limit(1);
	return shift ?? null;
}

export async function getShiftSummary(shiftId: string) {
	const [result] = await db.select({
		count: sql<number>`count(*)::int`,
		total: sql<number>`coalesce(sum(${appointments.price}), 0)::int`
	}).from(appointments).where(eq(appointments.shiftId, shiftId));
	const count = result?.count ?? 0;
	const total = result?.total ?? 0;
	return { count, total, average: count ? Math.round(total / count) : 0 };
}

export async function completeDueAppointments() {
	const due = await db.update(appointments)
		.set({ status: 'completed', updatedAt: new Date() })
		.where(and(eq(appointments.status, 'confirmed'), lte(appointments.visitAt, new Date())))
		.returning({ id: appointments.id });
	if (due.length) {
		await db.insert(appointmentEvents).values(due.map((row) => ({
			appointmentId: row.id,
			actorId: null,
			action: 'auto_completed',
			details: {}
		})));
	}
}

type WorkerGlobal = typeof globalThis & { __beautyCrmStatusWorker?: NodeJS.Timeout };

export function startStatusWorker() {
	const current = globalThis as WorkerGlobal;
	if (current.__beautyCrmStatusWorker) return;
	void completeDueAppointments().catch((cause) => console.error('Не удалось обновить статусы записей', cause));
	const timer = setInterval(() => {
		void completeDueAppointments().catch((cause) => console.error('Не удалось обновить статусы записей', cause));
	}, 30_000);
	timer.unref();
	current.__beautyCrmStatusWorker = timer;
}

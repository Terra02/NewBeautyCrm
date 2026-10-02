import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import {
	appointments, appointmentEvents, masters, salons, services, shifts, staffProfiles, user as authUser
} from '$lib/server/db/schema';
import {
	appointmentInput, appointmentStatuses, completeDueAppointments, getActiveShift,
	getShiftSummary, operatorInput, requireAdmin, requireUser
} from '$lib/server/crm';

function input(form: FormData) {
	return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

function validationMessage(result: { error: z.ZodError }) {
	return result.error.issues[0]?.message ?? 'Проверьте данные формы';
}

async function validReferences(salonId: string, serviceId: string, masterId: string) {
	const [salon] = await db.select({ id: salons.id }).from(salons).where(eq(salons.id, salonId)).limit(1);
	const [service] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.active, true))).limit(1);
	if (!salon || !service) return false;
	if (masterId) {
		const [master] = await db.select({ id: masters.id }).from(masters)
			.where(and(eq(masters.id, masterId), eq(masters.salonId, salonId), eq(masters.active, true))).limit(1);
		if (!master) return false;
	}
	return true;
}

export const load: PageServerLoad = async (event) => {
	const current = requireUser(event);
	await completeDueAppointments();
	const isAdmin = current.role === 'admin';
	const operatorSearch = isAdmin ? (event.url.searchParams.get('operatorSearch') ?? '').trim().slice(0, 80) : '';
	const requestedOperatorPage = Number.parseInt(event.url.searchParams.get('operatorPage') ?? '1', 10);
	const operatorPageSize = 25;
	const operatorFilter = and(
		ne(authUser.role, 'admin'),
		operatorSearch ? or(
			ilike(authUser.name, `%${operatorSearch}%`),
			ilike(authUser.username, `%${operatorSearch}%`),
			ilike(staffProfiles.staffCode, `%${operatorSearch}%`)
		) : undefined
	);
	const [allSalons, allServices, allMasters, profile, activeShift] = await Promise.all([
		db.select().from(salons).orderBy(salons.name),
		db.select().from(services).orderBy(services.name),
		db.select().from(masters).orderBy(masters.name),
		db.select().from(staffProfiles).where(eq(staffProfiles.userId, current.id)).limit(1),
		isAdmin ? Promise.resolve(null) : getActiveShift(current.id)
	]);
	const allAppointments = await db.select({
		id: appointments.id,
		clientName: appointments.clientName,
		clientPhone: appointments.clientPhone,
		comment: appointments.comment,
		visitAt: appointments.visitAt,
		price: appointments.price,
		paymentStatus: appointments.paymentStatus,
		status: appointments.status,
		source: appointments.source,
		createdAt: appointments.createdAt,
		operatorId: appointments.operatorId,
		operatorName: authUser.name,
		shiftId: appointments.shiftId,
		salonId: salons.id,
		salonName: salons.name,
		serviceId: services.id,
		serviceName: services.name,
		masterId: masters.id,
		masterName: masters.name
	}).from(appointments)
		.innerJoin(authUser, eq(authUser.id, appointments.operatorId))
		.innerJoin(salons, eq(salons.id, appointments.salonId))
		.innerJoin(services, eq(services.id, appointments.serviceId))
		.leftJoin(masters, eq(masters.id, appointments.masterId))
		.where(isAdmin ? undefined : eq(appointments.operatorId, current.id))
		.orderBy(desc(appointments.createdAt)).limit(500);
	const shiftRows = await db.select({
		id: shifts.id, operatorId: shifts.operatorId, operatorName: authUser.name,
		startedAt: shifts.startedAt, endedAt: shifts.endedAt,
		count: sql<number>`count(${appointments.id})::int`,
		total: sql<number>`coalesce(sum(${appointments.price}), 0)::int`
	}).from(shifts).innerJoin(authUser, eq(authUser.id, shifts.operatorId))
		.leftJoin(appointments, eq(appointments.shiftId, shifts.id))
		.where(isAdmin ? undefined : eq(shifts.operatorId, current.id))
		.groupBy(shifts.id, authUser.id).orderBy(desc(shifts.startedAt));
	const [{ total: operatorTotal }] = isAdmin
		? await db.select({ total: sql<number>`count(*)::int` }).from(authUser)
			.leftJoin(staffProfiles, eq(staffProfiles.userId, authUser.id)).where(operatorFilter)
		: [{ total: 0 }];
	const operatorPages = Math.max(1, Math.ceil(operatorTotal / operatorPageSize));
	const operatorPage = Number.isSafeInteger(requestedOperatorPage) && requestedOperatorPage > 0
		? Math.min(requestedOperatorPage, operatorPages) : 1;
	const operators = isAdmin ? await db.select({
		id: authUser.id, name: authUser.name, username: authUser.username,
		banned: authUser.banned, staffCode: staffProfiles.staffCode, createdAt: authUser.createdAt
	}).from(authUser).leftJoin(staffProfiles, eq(staffProfiles.userId, authUser.id))
		.where(operatorFilter).orderBy(desc(authUser.createdAt), authUser.name)
		.limit(operatorPageSize).offset((operatorPage - 1) * operatorPageSize) : [];
	const summary = activeShift ? await getShiftSummary(activeShift.id) : { count: 0, total: 0, average: 0 };
	return {
		current: { id: current.id, name: current.name, username: current.username ?? '', role: current.role ?? 'user', staffCode: profile[0]?.staffCode ?? '' },
		isAdmin, activeShift, summary, appointments: allAppointments,
		shifts: shiftRows, salons: allSalons, services: allServices,
		masters: allMasters, operators,
		operatorPagination: { query: operatorSearch, page: operatorPage, pages: operatorPages, total: operatorTotal, pageSize: operatorPageSize }
	};
};

export const actions: Actions = {
	openShift: async (event) => {
		const current = requireUser(event);
		if (current.role === 'admin') return fail(403, { message: 'Смена доступна оператору' });
		if (await getActiveShift(current.id)) return fail(409, { message: 'Смена уже открыта' });
		await db.insert(shifts).values({ operatorId: current.id });
		redirect(303, '/app?view=overview');
	},
	closeShift: async (event) => {
		const current = requireUser(event);
		const shift = await getActiveShift(current.id);
		if (!shift) return fail(409, { message: 'Открытая смена не найдена' });
		await db.update(shifts).set({ endedAt: new Date() }).where(and(eq(shifts.id, shift.id), isNull(shifts.endedAt)));
		await auth.api.signOut({ headers: event.request.headers });
		redirect(303, '/login?shift=closed');
	},
	createAppointment: async (event) => {
		const current = requireUser(event);
		const parsed = appointmentInput.safeParse(input(await event.request.formData()));
		if (!parsed.success) return fail(400, { message: validationMessage(parsed) });
		const value = parsed.data;
		if (new Date(value.visitAt) <= new Date()) return fail(400, { message: 'Время визита должно быть в будущем' });
		const shift = current.role === 'admin' ? null : await getActiveShift(current.id);
		if (current.role !== 'admin' && !shift) return fail(403, { message: 'Сначала откройте смену' });
		if (!(await validReferences(value.salonId, value.serviceId, value.masterId))) {
			return fail(400, { message: 'Услуга, салон или мастер недоступны' });
		}
		await db.transaction(async (tx) => {
			const [created] = await tx.insert(appointments).values({
				operatorId: current.id, shiftId: shift?.id ?? null,
				salonId: value.salonId, serviceId: value.serviceId,
				masterId: value.masterId || null, clientName: value.clientName,
				clientPhone: value.clientPhone, comment: value.comment,
				visitAt: new Date(value.visitAt), price: value.price,
				paymentStatus: value.paymentStatus, source: value.source, status: 'new'
			}).returning({ id: appointments.id });
			await tx.insert(appointmentEvents).values({ appointmentId: created.id, actorId: current.id, action: 'created' });
		});
		redirect(303, '/app?view=appointments&notice=created');
	},
	updateAppointment: async (event) => {
		const current = requireAdmin(event);
		const raw = input(await event.request.formData());
		const id = z.uuid().safeParse(raw.id);
		const parsed = appointmentInput.safeParse(raw);
		if (!id.success || !parsed.success) return fail(400, { message: parsed.success ? 'Неверный ID записи' : validationMessage(parsed) });
		const value = parsed.data;
		if (!(await validReferences(value.salonId, value.serviceId, value.masterId))) return fail(400, { message: 'Услуга, салон или мастер недоступны' });
		await db.transaction(async (tx) => {
			await tx.update(appointments).set({
				clientName: value.clientName, clientPhone: value.clientPhone,
				comment: value.comment, visitAt: new Date(value.visitAt),
				price: value.price, paymentStatus: value.paymentStatus,
				source: value.source, salonId: value.salonId,
				serviceId: value.serviceId, masterId: value.masterId || null,
				updatedAt: new Date()
			}).where(eq(appointments.id, id.data));
			await tx.insert(appointmentEvents).values({ appointmentId: id.data, actorId: current.id, action: 'updated' });
		});
		redirect(303, '/app?view=appointments&notice=updated');
	},
	setStatus: async (event) => {
		const current = requireAdmin(event);
		const raw = input(await event.request.formData());
		const id = z.uuid().safeParse(raw.id);
		const status = z.enum(appointmentStatuses).safeParse(raw.status);
		if (!id.success || !status.success) return fail(400, { message: 'Неверные данные статуса' });
		const [existing] = await db.select({ id: appointments.id, visitAt: appointments.visitAt })
			.from(appointments).where(eq(appointments.id, id.data)).limit(1);
		if (!existing) return fail(404, { message: 'Запись не найдена' });
		const next = status.data === 'confirmed' && existing.visitAt <= new Date() ? 'completed' : status.data;
		await db.transaction(async (tx) => {
			await tx.update(appointments).set({ status: next, updatedAt: new Date() }).where(eq(appointments.id, id.data));
			await tx.insert(appointmentEvents).values({ appointmentId: id.data, actorId: current.id, action: `status_${next}` });
		});
		redirect(303, '/app?view=appointments&notice=status');
	},
	deleteAppointment: async (event) => {
		requireAdmin(event);
		const raw = input(await event.request.formData());
		const id = z.uuid().safeParse(raw.id);
		if (!id.success) return fail(400, { message: 'Неверный ID записи' });
		await db.delete(appointments).where(eq(appointments.id, id.data));
		redirect(303, '/app?view=appointments&notice=deleted');
	},
	createOperator: async (event) => {
		requireAdmin(event);
		const parsed = operatorInput.safeParse(input(await event.request.formData()));
		if (!parsed.success) return fail(400, { message: validationMessage(parsed), tab: 'operators' });
		const { name, login, password } = parsed.data;
		const [existing] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.username, login)).limit(1);
		if (existing) return fail(409, { message: 'Такой логин уже занят', tab: 'operators' });
		let staffCode = '';
		for (let attempt = 0; attempt < 10; attempt++) {
			const candidate = String(randomInt(100000, 1000000));
			const [found] = await db.select({ userId: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.staffCode, candidate)).limit(1);
			if (!found) { staffCode = candidate; break; }
		}
		if (!staffCode) return fail(500, { message: 'Не удалось создать код сотрудника', tab: 'operators' });
		try {
			const created = await auth.api.createUser({
				body: { email: `staff-${randomUUID()}@example.com`, name, password, role: 'user', data: { username: login } },
				headers: event.request.headers
			});
			const createdId = created.user.id;
			await db.update(authUser).set({ username: login, displayUsername: login }).where(eq(authUser.id, createdId));
			await db.insert(staffProfiles).values({ userId: createdId, staffCode });
		} catch (cause) {
			console.error('Не удалось создать оператора', cause);
			return fail(500, { message: 'Не удалось создать оператора. Проверьте логин и повторите попытку.', tab: 'operators' });
		}
		return { tab: 'operators', credentials: { name, login, password, staffCode } };
	},
	createSalon: async (event) => {
		requireAdmin(event);
		const name = String((await event.request.formData()).get('name') ?? '').trim();
		if (name.length < 2 || name.length > 80) return fail(400, { message: 'Укажите название салона', tab: 'settings' });
		await db.insert(salons).values({ name });
		redirect(303, '/app?view=settings&notice=salon');
	},
	createService: async (event) => {
		requireAdmin(event);
		const raw = input(await event.request.formData());
		const parsed = z.object({ name: z.string().trim().min(2).max(80), defaultPrice: z.coerce.number().int().min(0) }).safeParse(raw);
		if (!parsed.success) return fail(400, { message: validationMessage(parsed), tab: 'settings' });
		await db.insert(services).values({ ...parsed.data, durationMinutes: 60 });
		redirect(303, '/app?view=settings&notice=service');
	},
	createMaster: async (event) => {
		requireAdmin(event);
		const raw = input(await event.request.formData());
		const parsed = z.object({ name: z.string().trim().min(2).max(80), salonId: z.uuid() }).safeParse(raw);
		if (!parsed.success) return fail(400, { message: validationMessage(parsed), tab: 'settings' });
		await db.insert(masters).values(parsed.data);
		redirect(303, '/app?view=settings&notice=master');
	},
	signOut: async (event) => {
		const current = requireUser(event);
		if (current.role !== 'admin' && await getActiveShift(current.id)) return fail(409, { message: 'Перед выходом закройте смену', tab: 'profile' });
		await auth.api.signOut({ headers: event.request.headers });
		redirect(303, '/login');
	}
};

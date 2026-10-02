import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username } from 'better-auth/plugins';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema.ts';

const url = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD;
if (!url || !secret || !adminPassword || !operatorPassword) {
	throw new Error('Заполните DATABASE_URL, BETTER_AUTH_SECRET и пароли тестовых пользователей в .env');
}

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });
const seedAuth = betterAuth({
	baseURL: process.env.ORIGIN || 'http://localhost:5173',
	secret,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32 }), admin()]
});

async function ensureUser(login: string, name: string, email: string, password: string, role: string) {
	let [person] = await db.select().from(schema.user).where(eq(schema.user.username, login)).limit(1);
	if (!person) {
		const created = await seedAuth.api.signUpEmail({ body: { name, email, password, username: login } });
		if (!created.user) throw new Error(`Не удалось создать ${login}`);
		[person] = await db.select().from(schema.user).where(eq(schema.user.id, created.user.id)).limit(1);
	}
	if (!person) throw new Error(`Пользователь ${login} не найден после создания`);
	await db.update(schema.user).set({ role }).where(eq(schema.user.id, person.id));
	return person.id;
}

async function ensureSalon(name: string) {
	const [found] = await db.select().from(schema.salons).where(eq(schema.salons.name, name)).limit(1);
	if (found) return found.id;
	const [created] = await db.insert(schema.salons).values({ name }).returning({ id: schema.salons.id });
	return created.id;
}

async function ensureService(name: string, durationMinutes: number, defaultPrice: number) {
	const [found] = await db.select().from(schema.services).where(eq(schema.services.name, name)).limit(1);
	if (found) return found.id;
	const [created] = await db.insert(schema.services).values({ name, durationMinutes, defaultPrice })
		.returning({ id: schema.services.id });
	return created.id;
}

async function ensureMaster(name: string, salonId: string) {
	const [found] = await db.select().from(schema.masters).where(and(eq(schema.masters.name, name), eq(schema.masters.salonId, salonId))).limit(1);
	if (found) return found.id;
	const [created] = await db.insert(schema.masters).values({ name, salonId }).returning({ id: schema.masters.id });
	return created.id;
}

try {
	const adminId = await ensureUser('admin', 'Администратор', 'admin@example.com', adminPassword, 'admin');
	const operatorId = await ensureUser('operator', 'Мария Иванова', 'operator@example.com', operatorPassword, 'user');
	const [profile] = await db.select().from(schema.staffProfiles).where(eq(schema.staffProfiles.userId, operatorId)).limit(1);
	if (!profile) await db.insert(schema.staffProfiles).values({ userId: operatorId, staffCode: '482731' });

	const centralId = await ensureSalon('Центральный салон');
	const arbatId = await ensureSalon('Салон на Арбате');
	const haircutId = await ensureService('Стрижка', 60, 1800);
	const nailsId = await ensureService('Маникюр', 90, 2300);
	const colorId = await ensureService('Окрашивание', 150, 6500);
	await ensureService('Укладка', 60, 2700);
	const annaId = await ensureMaster('Анна Белова', centralId);
	const mariaId = await ensureMaster('Мария Климова', arbatId);

	const [existingAppointment] = await db.select({ id: schema.appointments.id }).from(schema.appointments).limit(1);
	if (!existingAppointment) {
		const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const endedAt = new Date(startedAt.getTime() + 8 * 60 * 60 * 1000);
		const [shift] = await db.insert(schema.shifts).values({ operatorId, startedAt, endedAt }).returning({ id: schema.shifts.id });
		const todayAt = (hour: number) => {
			const date = new Date();
			date.setHours(hour, 0, 0, 0);
			return date <= new Date() ? new Date(date.getTime() + 24 * 60 * 60 * 1000) : date;
		};
		await db.insert(schema.appointments).values([
			{ operatorId, shiftId: shift.id, salonId: centralId, masterId: annaId, serviceId: haircutId, clientName: 'Алина Петрова', clientPhone: '+7 999 123-45-67', visitAt: todayAt(18), price: 1800, status: 'confirmed', paymentStatus: 'paid', source: 'call', createdAt: startedAt },
			{ operatorId, shiftId: shift.id, salonId: arbatId, masterId: mariaId, serviceId: nailsId, clientName: 'Виктория Орлова', clientPhone: '+7 999 234-56-78', visitAt: todayAt(20), price: 2300, status: 'new', paymentStatus: 'pending', source: 'instagram', createdAt: startedAt },
			{ operatorId, shiftId: shift.id, salonId: centralId, masterId: annaId, serviceId: colorId, clientName: 'Екатерина Морозова', clientPhone: '+7 999 345-67-89', visitAt: new Date(Date.now() + 48 * 60 * 60 * 1000), price: 6500, status: 'new', paymentStatus: 'deposit_half', source: 'recommendation', createdAt: startedAt }
		]);
	}
	console.log('Тестовые данные готовы.');
	console.log(`Администратор: admin / ${adminPassword}`);
	console.log(`Оператор: operator / ${operatorPassword} / код 482731`);
	console.log(`ID администратора: ${adminId}`);
} finally {
	await client.end();
}

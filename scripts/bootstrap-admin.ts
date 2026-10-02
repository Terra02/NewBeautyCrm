import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema.ts';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const login = process.env.BOOTSTRAP_ADMIN_LOGIN || 'admin';
const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Администратор';

if (!databaseUrl || !secret || !process.env.ORIGIN || !password) {
	throw new Error('Нужны DATABASE_URL, BETTER_AUTH_SECRET, ORIGIN и BOOTSTRAP_ADMIN_PASSWORD');
}
if (password.length < 8) throw new Error('Пароль администратора должен содержать минимум 8 символов');
if (!/^[a-zA-Z0-9._]{3,32}$/.test(login)) throw new Error('Логин администратора имеет неверный формат');

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });
const setupAuth = betterAuth({
	baseURL: process.env.ORIGIN,
	secret,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32 }), admin()]
});

try {
	const [existingUser] = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
	if (existingUser) throw new Error('В базе уже есть пользователи. Первичное создание администратора отменено.');

	let created;
	try {
		created = await setupAuth.api.signUpEmail({
			body: { name, email: 'admin@example.com', password, username: login }
		});
	} catch {
		throw new Error('Не удалось создать администратора. Проверьте подключение к базе и параметры входа.');
	}
	if (!created.user) throw new Error('Администратор не был создан');
	await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, created.user.id));
	console.log(`Администратор создан. Логин: ${login}. Пароль не выводится.`);
} finally {
	await client.end();
}

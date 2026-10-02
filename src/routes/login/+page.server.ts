import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { staffProfiles, user } from '$lib/server/db/schema';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app');
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const login = String(data.get('login') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const staffCode = String(data.get('staffCode') ?? '').trim().replace(/[\s-]/g, '');
		if (!login || !password) return fail(400, { message: 'Введите логин и пароль', login });

		const [person] = await db.select({ id: user.id, role: user.role, banned: user.banned, staffCode: staffProfiles.staffCode })
			.from(user).leftJoin(staffProfiles, eq(staffProfiles.userId, user.id))
			.where(eq(user.username, login)).limit(1);
		if (!person || person.banned || (person.role !== 'admin' && person.staffCode !== staffCode)) {
			return fail(400, { message: 'Неверный логин, пароль или код сотрудника', login });
		}

		try {
			await auth.api.signInUsername({ body: { username: login, password } });
		} catch {
			return fail(400, { message: 'Неверный логин, пароль или код сотрудника', login });
		}
		redirect(303, '/app');
	}
};

import assert from 'node:assert/strict';
import postgres from 'postgres';

const base = process.env.ORIGIN || 'http://127.0.0.1:5173';
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function request(path: string, options: RequestInit = {}, cookie = '') {
	const response = await fetch(new URL(path, base), {
		...options,
		redirect: 'manual',
		headers: { accept: 'text/html', ...(cookie ? { cookie } : {}), ...options.headers }
	});
	return response;
}

async function post(path: string, data: Record<string, string>, cookie = '') {
	return request(path, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(data)
	}, cookie);
}

function sessionCookie(response: Response) {
	return response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
}

try {
	let page = await request('/login');
	let html = await page.text();
	assert.ok(html.includes('Beauty CRM'), 'new brand is visible on login');
	assert.ok(!html.includes('Ателье'), 'old brand is gone');
	assert.ok(!html.includes('brand-mark'), 'brand calendar icon is gone');

	let response = await post('/login', { login: 'operator', password: process.env.SEED_OPERATOR_PASSWORD!, staffCode: '000000' });
	assert.equal(response.status, 400, 'wrong staff code must be rejected');

	response = await post('/login', { login: 'operator', password: process.env.SEED_OPERATOR_PASSWORD!, staffCode: '482 731' });
	assert.equal(response.status, 303, `operator login: ${response.status} ${await response.text()}`);
	const operatorCookie = sessionCookie(response);
	assert.ok(operatorCookie.includes('session_token'), 'operator session cookie');

	response = await request('/app', {}, operatorCookie);
	assert.equal(response.status, 200, 'operator dashboard');

	const [operator] = await sql`select id from "user" where username = 'operator'`;
	const open = await sql`select id from shifts where operator_id = ${operator.id} and ended_at is null`;
	if (!open.length) {
		response = await post('/app?/openShift', {}, operatorCookie);
		assert.equal(response.status, 303, 'open shift');
	}

	const [salon] = await sql`select id from salons limit 1`;
	const [service] = await sql`select id from services limit 1`;
	const clientName = `Проверка ${Date.now()}`;
	response = await post('/app?/createAppointment', {
		clientName, clientPhone: '+79991234567', salonId: salon.id,
		serviceId: service.id, masterId: '', comment: 'Проверка сценария',
		visitAt: new Date(Date.now() + 86400000).toISOString(),
		price: '1800', paymentStatus: 'pending', source: 'call'
	}, operatorCookie);
	assert.equal(response.status, 303, `create appointment: ${response.status} ${await response.text()}`);
	const [appointment] = await sql`select id, status, shift_id from appointments where client_name = ${clientName}`;
	assert.equal(appointment.status, 'new');
	assert.ok(appointment.shift_id);

	response = await post('/login', { login: 'admin', password: process.env.SEED_ADMIN_PASSWORD!, staffCode: '' });
	assert.equal(response.status, 303, 'admin login');
	const adminCookie = sessionCookie(response);
	assert.ok(adminCookie.includes('session_token'), 'admin session cookie');
	const temporaryService = `Проверка услуги ${Date.now()}`;
	response = await post('/app?/createService', { name: temporaryService, defaultPrice: '3450' }, adminCookie);
	assert.equal(response.status, 303, 'create service with name and price');
	const [newService] = await sql`select id, default_price from services where name = ${temporaryService}`;
	assert.equal(newService.default_price, 3450);
	const temporaryLogin = `test${Date.now()}`;
	response = await post('/app?/createOperator', {
		name: 'Тестовый оператор', login: temporaryLogin, password: 'TestPass123!'
	}, adminCookie);
	assert.equal(response.status, 200, `create operator: ${response.status} ${await response.text()}`);
	const [newOperator] = await sql`select u.id, p.staff_code from "user" u join staff_profiles p on p.user_id = u.id where u.username = ${temporaryLogin}`;
	assert.match(newOperator.staff_code, /^\d{6}$/);
	for (const query of [temporaryLogin, newOperator.staff_code]) {
		response = await request(`/app?view=operators&operatorSearch=${encodeURIComponent(query)}&operatorPage=999`, {}, adminCookie);
		assert.equal(response.status, 200, 'operator search page');
		html = await response.text();
		assert.ok(html.includes(temporaryLogin), 'matching operator is listed');
		assert.ok(html.includes('Страница 1 из 1'), 'out-of-range page is clamped');
	}
	response = await request('/app?view=operators&operatorSearch=zz-no-match-zz', {}, adminCookie);
	assert.ok((await response.text()).includes('Операторы не найдены'), 'empty search state');
	const pagingPrefix = `paging${Date.now()}`;
	const pagingUsers = Array.from({ length: 26 }, (_, index) => ({
		id: `${pagingPrefix}-${index}`, name: `Проверка списка ${index}`,
		email: `${pagingPrefix}-${index}@example.com`, username: `${pagingPrefix}${index}`, role: 'user'
	}));
	try {
		await sql`insert into "user" ${sql(pagingUsers, 'id', 'name', 'email', 'username', 'role')}`;
		for (const [number, expected] of [[1, 25], [2, 1]]) {
			response = await request(`/app?view=operators&operatorSearch=${pagingPrefix}&operatorPage=${number}`, {}, adminCookie);
			assert.equal(response.status, 200, `operator page ${number}`);
			html = await response.text();
			assert.ok(html.includes(`Страница ${number} из 2`), 'page indicator');
			assert.equal((html.match(/class="operator-person"/g) ?? []).length, expected, 'page size');
		}
	} finally {
		await sql`delete from "user" where id like ${pagingPrefix + '-%'}`;
	}

	response = await post('/app?/setStatus', { id: appointment.id, status: 'confirmed' }, operatorCookie);
	assert.equal(response.status, 403, 'operator cannot set status');
	const [stillNew] = await sql`select status from appointments where id = ${appointment.id}`;
	assert.equal(stillNew.status, 'new');

	response = await post('/app?/setStatus', { id: appointment.id, status: 'confirmed' }, adminCookie);
	assert.equal(response.status, 303, `admin confirmation: ${response.status} ${await response.text()}`);
	const [confirmed] = await sql`select status from appointments where id = ${appointment.id}`;
	assert.equal(confirmed.status, 'confirmed');
	await sql`update appointments set visit_at = now() - interval '1 minute' where id = ${appointment.id}`;
	response = await request('/app', {}, adminCookie);
	assert.equal(response.status, 200, 'admin dashboard after due time');
	const [completed] = await sql`select status from appointments where id = ${appointment.id}`;
	assert.equal(completed.status, 'completed', 'due visit completes automatically');

	response = await post('/app?/closeShift', {}, operatorCookie);
	assert.equal(response.status, 303, 'close shift');
	const [closed] = await sql`select ended_at from shifts where operator_id = ${operator.id} order by started_at desc limit 1`;
	assert.ok(closed.ended_at);
	response = await request('/app', {}, operatorCookie);
	assert.equal(response.status, 303, 'closing shift revokes operator session');
	await sql`delete from appointments where client_name like 'Проверка %'`;
	await sql`delete from "user" where id = ${newOperator.id}`;
	await sql`delete from services where id = ${newService.id}`;

	console.log('Smoke test passed: brand, login, roles, shifts, appointments, operator search and pagination, service and operator creation, auto completion, signout.');
} finally {
	await sql.end();
}

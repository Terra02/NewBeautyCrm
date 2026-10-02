<script lang="ts">
	import { page } from '$app/state';
	import {
		CalendarDays, LayoutDashboard, ClipboardList, UsersRound, Clock3, Settings2,
		UserRound, LogOut, Plus, Search, ChevronLeft, ChevronRight, ArrowUpRight,
		Check, X, Copy, Pencil, Trash2, Phone, MapPin, Scissors, Menu, CreditCard
	} from '@lucide/svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	type Appointment = PageData['appointments'][number];
	const today = new Date();
	const todayKey = dateKey(today);
	let view = $state(page.url.searchParams.get('view') ?? 'overview');
	let showNotice = $state(page.url.searchParams.has('notice'));
	let menuOpen = $state(false);
	let month = $state(new Date(today.getFullYear(), today.getMonth(), 1));
	let selectedDate = $state(todayKey);
	let search = $state('');
	let shiftSearch = $state('');
	let showCreate = $state(false);
	let showOperator = $state(false);
	let showReport = $state(false);
	let detail = $state<Appointment | null>(null);
	let editing = $state<Appointment | null>(null);
	let copied = $state(false);
	let now = $state(Date.now());
	let newSalonId = $state('');
	let newServiceId = $state('');
	let newMasterId = $state('');
	let newPrice = $state('0');
	let newVisitAt = $state('');
	let editSalonId = $state('');
	let editServiceId = $state('');
	let editMasterId = $state('');
	let editVisitAt = $state('');
	let editPrice = $state('');

	$effect(() => {
		const timer = setInterval(() => now = Date.now(), 1000);
		return () => clearInterval(timer);
	});
	$effect(() => {
		if (form && 'tab' in form && form.tab) view = String(form.tab);
	});
	$effect(() => {
		showNotice = page.url.searchParams.has('notice');
	});
	$effect(() => {
		if (!newSalonId && data.salons.length) newSalonId = data.salons[0].id;
		if (!newServiceId && data.services.length) {
			const service = data.services.find((item) => item.active);
			if (service) { newServiceId = service.id; newPrice = String(service.defaultPrice); }
		}
	});

	const statusLabels: Record<string, string> = {
		new: 'Новая запись', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена'
	};
	const paymentLabels: Record<string, string> = {
		pending: 'Ожидает оплаты', paid: 'Оплачено', deposit_half: 'Предоплата 50%'
	};
	const sourceLabels: Record<string, string> = {
		call: 'Звонок', instagram: 'Instagram', website: 'Сайт', recommendation: 'Рекомендация', walk_in: 'Пришёл сам'
	};
	let nav = $derived([
		{ id: 'overview', title: 'Обзор', icon: LayoutDashboard },
		{ id: 'appointments', title: 'Записи', icon: CalendarDays },
		{ id: 'shifts', title: 'Смены', icon: Clock3 },
		...(data.isAdmin ? [{ id: 'operators', title: 'Операторы', icon: UsersRound }, { id: 'settings', title: 'Справочники', icon: Settings2 }] : []),
		{ id: 'profile', title: 'Профиль', icon: UserRound }
	]);

	let filteredAppointments = $derived(data.appointments.filter((item) => {
		const query = search.trim().toLowerCase();
		return !query || [item.clientName, item.clientPhone, item.serviceName, item.salonName, item.operatorName]
			.some((value) => value?.toLowerCase().includes(query));
	}));
	let filteredShifts = $derived(data.shifts.filter((shift) => {
		const query = shiftSearch.trim().toLowerCase();
		return !query || [shift.operatorName, formatDateTime(shift.startedAt), shift.endedAt ? formatDateTime(shift.endedAt) : 'Открыта']
			.some((value) => value.toLowerCase().includes(query));
	}));
	let selectedAppointments = $derived(filteredAppointments.filter((item) => dateKey(item.visitAt) === selectedDate)
		.sort((a, b) => new Date(a.visitAt).getTime() - new Date(b.visitAt).getTime()));
	let todayAppointments = $derived(data.appointments.filter((item) => dateKey(item.visitAt) === todayKey));
	let newCount = $derived(data.appointments.filter((item) => item.status === 'new').length);
	let reportText = $derived(data.activeShift ? [
		`Отчёт о смене — ${data.current.name}`,
		`Начало: ${formatDateTime(data.activeShift.startedAt)}`,
		`Окончание: ${formatDateTime(new Date(now))}`,
		`Время работы: ${duration(new Date(data.activeShift.startedAt).getTime(), now)}`,
		`Количество записей: ${data.summary.count}`,
		`Выручка за смену: ${money(data.summary.total)}`,
		`Средний чек: ${money(data.summary.average)}`
	].join('\n') : '');
	let credentials = $derived(form && 'credentials' in form ? form.credentials : null);
	let message = $derived(form && 'message' in form ? form.message : null);

	function dateKey(value: Date | string) {
		const date = new Date(value);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}
	function money(value: number) { return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`; }
	function formatDate(value: Date | string) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
	function formatDateTime(value: Date | string) { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
	function formatTime(value: Date | string) { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
	function duration(start: number, end: number) {
		const minutes = Math.max(0, Math.floor((end - start) / 60000));
		return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`;
	}
	function dateInput(value: Date | string) {
		const date = new Date(value);
		return `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	}
	function isoFromLocal(value: string) {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '' : date.toISOString();
	}
	function operatorPageUrl(number: number) {
		const params = new URLSearchParams({ view: 'operators' });
		if (data.operatorPagination.query) params.set('operatorSearch', data.operatorPagination.query);
		if (number > 1) params.set('operatorPage', String(number));
		return `/app?${params}`;
	}
	function daysInCalendar() {
		const first = new Date(month.getFullYear(), month.getMonth(), 1);
		const offset = (first.getDay() + 6) % 7;
		const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
		return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
	}
	function changeMonth(delta: number) { month = new Date(month.getFullYear(), month.getMonth() + delta, 1); }
	function openEdit(item: Appointment) {
		detail = null;
		editing = item;
		editSalonId = item.salonId;
		editServiceId = item.serviceId;
		editMasterId = item.masterId ?? '';
		editVisitAt = dateInput(item.visitAt);
		editPrice = String(item.price);
	}
	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
		copied = true;
		setTimeout(() => copied = false, 2000);
	}
	function navigateTo(next: string) {
		view = next;
		showNotice = false;
		menuOpen = false;
		history.replaceState({}, '', `/app?view=${next}`);
	}
</script>

<svelte:head>
	<title>{nav.find((item) => item.id === view)?.title ?? 'Обзор'} — Beauty CRM</title>
	<meta name="description" content="Кабинет записей и смен сотрудников" />
</svelte:head>

<div class="app-shell">
	{#if menuOpen}<button class="mobile-scrim" aria-label="Закрыть меню" onclick={() => menuOpen = false}></button>{/if}
	<aside class:open={menuOpen} class="sidebar">
		<div class="brand"><span>Beauty <small>CRM</small></span></div>
		<div class="side-caption">РАБОЧИЙ КАБИНЕТ</div>
		<nav class="side-nav" aria-label="Основная навигация">
			{#each nav as item}
				<button class:active={view === item.id} onclick={() => navigateTo(item.id)}><item.icon size={19} strokeWidth={1.8} /><span>{item.title}</span>{#if item.id === 'appointments' && data.isAdmin && newCount > 0}<b class="nav-badge">{newCount}</b>{/if}</button>
			{/each}
		</nav>
		<div class="sidebar-bottom">
			<div class="sidebar-user"><span class="avatar">{data.current.name.slice(0, 1).toUpperCase()}</span><div><strong>{data.current.name}</strong><small>{data.isAdmin ? 'Администратор' : 'Оператор'}</small></div></div>
			{#if !data.isAdmin && data.activeShift}
				<button class="sidebar-logout" onclick={() => { menuOpen = false; showReport = true; }}><LogOut size={17} />Выйти</button>
			{:else}
				<form method="POST" action="?/signOut"><button class="sidebar-logout" type="submit"><LogOut size={17} />Выйти</button></form>
			{/if}
		</div>
	</aside>
	<main class="main-content">
		<header class="topbar">
			<button class="menu-toggle" aria-label="Открыть меню" onclick={() => menuOpen = true}><Menu size={23} /></button>
			<div class="breadcrumb">Рабочий кабинет <span>/</span> <strong>{nav.find((item) => item.id === view)?.title ?? 'Обзор'}</strong></div>
			<div class="topbar-right"><span class="topbar-date">{formatDate(today)}</span><span class="top-avatar">{data.current.name.slice(0, 1).toUpperCase()}</span></div>
		</header>
		<div class="page-content">
			{#if message}<div class="alert error page-alert">{message}</div>{/if}
			{#if showNotice}<div class="alert success page-alert">Изменения сохранены.</div>{/if}

			{#if view === 'overview'}
				<div class="page-heading"><div><div class="eyebrow">{data.isAdmin ? 'ОБЗОР СИСТЕМЫ' : 'МОЯ РАБОТА'}</div><h1>Добрый день, {data.current.name.split(' ')[0]}!</h1><p>Вот что происходит в вашем рабочем пространстве сегодня.</p></div><button class="button primary" onclick={() => showCreate = true} disabled={!data.isAdmin && !data.activeShift}><Plus size={18} /> Новая запись</button></div>
				{#if !data.isAdmin}
					<div class:shift-open={!!data.activeShift} class="shift-banner"><div class="shift-banner-icon"><Clock3 size={25} /></div><div class="shift-banner-copy"><span class="eyebrow">ТЕКУЩАЯ СМЕНА</span><h2>{data.activeShift ? 'Смена идёт' : 'Смена не открыта'}</h2><p>{data.activeShift ? `Начало в ${formatTime(data.activeShift.startedAt)} · ${duration(new Date(data.activeShift.startedAt).getTime(), now)}` : 'Откройте смену, чтобы создавать новые записи.'}</p></div>{#if data.activeShift}<button class="button outline" onclick={() => showReport = true}>Закрыть смену</button>{:else}<form method="POST" action="?/openShift"><button class="button primary" type="submit">Открыть смену <ArrowUpRight size={17} /></button></form>{/if}</div>
				{/if}
				<div class="stat-grid">
					<div class="stat-card"><div class="stat-icon"><CalendarDays size={21} /></div><span>{data.isAdmin ? 'Всего записей' : 'Записей за смену'}</span><strong>{data.isAdmin ? data.appointments.length : data.summary.count}</strong><small>{data.isAdmin ? 'В доступном списке' : 'Создано вами за текущую смену'}</small></div>
					<div class="stat-card"><div class="stat-icon"><ClipboardList size={21} /></div><span>Сегодня</span><strong>{todayAppointments.length}</strong><small>Визитов запланировано</small></div>
					<div class="stat-card"><div class="stat-icon"><CreditCard size={21} /></div><span>{data.isAdmin ? 'Сумма записей' : 'Выручка за смену'}</span><strong>{money(data.isAdmin ? data.appointments.reduce((sum, item) => sum + item.price, 0) : data.summary.total)}</strong><small>По стоимости созданных записей</small></div>
					<div class="stat-card"><div class="stat-icon"><ArrowUpRight size={21} /></div><span>Средний чек</span><strong>{money(data.isAdmin ? (data.appointments.length ? Math.round(data.appointments.reduce((sum, item) => sum + item.price, 0) / data.appointments.length) : 0) : data.summary.average)}</strong><small>По созданным записям</small></div>
				</div>
				<div class="section-card"><div class="section-card-head"><div><h2>Ближайшие записи</h2><p>Клиенты и услуги на сегодня</p></div><button class="text-button" onclick={() => navigateTo('appointments')}>Все записи <ArrowUpRight size={17} /></button></div>{#if todayAppointments.length}<div class="table-wrap"><table><thead><tr><th>Время</th><th>Клиент</th><th>Услуга</th><th>Салон</th><th>Статус</th><th></th></tr></thead><tbody>{#each todayAppointments.slice(0, 8) as item}<tr><td class="time-cell">{formatTime(item.visitAt)}</td><td><strong>{item.clientName}</strong><small>{item.clientPhone}</small></td><td>{item.serviceName}</td><td>{item.salonName}</td><td><span class={`status status-${item.status}`}>{statusLabels[item.status]}</span></td><td><button class="icon-button" aria-label="Открыть запись" onclick={() => detail = item}><ArrowUpRight size={18} /></button></td></tr>{/each}</tbody></table></div>{:else}<div class="empty-state"><CalendarDays size={28} /><strong>На сегодня записей нет</strong><span>Создайте запись или выберите другую дату в календаре.</span></div>{/if}</div>
			{:else if view === 'appointments'}
				<div class="page-heading"><div><div class="eyebrow">РАСПИСАНИЕ</div><h1>Записи клиентов</h1><p>{data.isAdmin ? 'Все созданные записи и их актуальные статусы.' : 'Записи, созданные вами.'}</p></div><button class="button primary" onclick={() => showCreate = true} disabled={!data.isAdmin && !data.activeShift}><Plus size={18} /> Новая запись</button></div>
				<div class="calendar-layout"><div class="section-card calendar-card"><div class="calendar-head"><div><h2>Календарь</h2><p>Выберите день для просмотра записей</p></div><div class="month-controls"><button aria-label="Предыдущий месяц" onclick={() => changeMonth(-1)}><ChevronLeft size={18} /></button><strong>{new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(month)}</strong><button aria-label="Следующий месяц" onclick={() => changeMonth(1)}><ChevronRight size={18} /></button></div></div><div class="calendar-grid">{#each ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] as weekday}<div class="weekday">{weekday}</div>{/each}{#each daysInCalendar() as day}<button class:outside={day.getMonth() !== month.getMonth()} class:selected={dateKey(day) === selectedDate} class:today={dateKey(day) === todayKey} class="calendar-day" onclick={() => { selectedDate = dateKey(day); if (day.getMonth() !== month.getMonth()) month = new Date(day.getFullYear(), day.getMonth(), 1); }}><span>{day.getDate()}</span>{#if filteredAppointments.some((item) => dateKey(item.visitAt) === dateKey(day))}<i></i>{/if}</button>{/each}</div><div class="calendar-legend"><span><i class="legend-dot"></i> Есть записи</span><span><i class="legend-today"></i> Сегодня</span></div></div><div class="section-card day-card"><div class="section-card-head"><div><h2>{formatDate(`${selectedDate}T12:00:00`)}</h2><p>{selectedAppointments.length} {selectedAppointments.length === 1 ? 'запись' : 'записей'}</p></div></div><div class="day-list">{#if selectedAppointments.length}{#each selectedAppointments as item}<button class="day-item" onclick={() => detail = item}><div class="day-time">{formatTime(item.visitAt)}</div><div class="day-item-main"><strong>{item.clientName}</strong><span>{item.serviceName} · {item.salonName}</span></div><span class={`status status-${item.status}`}>{statusLabels[item.status]}</span></button>{/each}{:else}<div class="empty-state compact"><CalendarDays size={26} /><strong>Записей на этот день нет</strong><span>Выберите другую дату или создайте запись.</span></div>{/if}</div></div></div>
				<div class="section-card records-card"><div class="section-card-head"><div><h2>Все записи</h2><p>Клиенты, время визита и детали заявки</p></div><div class="search-box"><Search size={17} /><input bind:value={search} placeholder="Поиск по имени, телефону, услуге" aria-label="Поиск записей" /></div></div>{#if filteredAppointments.length}<div class="table-wrap"><table><thead><tr><th>Клиент</th><th>Дата и время</th><th>Услуга / салон</th><th>Оператор</th><th>Стоимость</th><th>Статус</th><th></th></tr></thead><tbody>{#each filteredAppointments as item}<tr><td><strong>{item.clientName}</strong><small>{item.clientPhone}</small></td><td>{formatDateTime(item.visitAt)}</td><td><strong>{item.serviceName}</strong><small>{item.salonName}{item.masterName ? ` · ${item.masterName}` : ''}</small></td><td>{item.operatorName}</td><td class="price-cell">{money(item.price)}</td><td><span class={`status status-${item.status}`}>{statusLabels[item.status]}</span></td><td><button class="icon-button" aria-label="Открыть запись" onclick={() => detail = item}><ArrowUpRight size={18} /></button></td></tr>{/each}</tbody></table></div>{:else}<div class="empty-state"><Search size={28} /><strong>Записи не найдены</strong><span>Попробуйте изменить поисковый запрос.</span></div>{/if}</div>
			{:else if view === 'shifts'}
				<div class="page-heading"><div><div class="eyebrow">УЧЁТ ВРЕМЕНИ</div><h1>Смены</h1><p>{data.isAdmin ? 'История работы операторов и результаты смен.' : 'Ваше рабочее время и история смен.'}</p></div></div>
				{#if !data.isAdmin}<div class:shift-open={!!data.activeShift} class="shift-banner shift-page-banner"><div class="shift-banner-icon"><Clock3 size={25} /></div><div class="shift-banner-copy"><span class="eyebrow">СЕЙЧАС</span><h2>{data.activeShift ? duration(new Date(data.activeShift.startedAt).getTime(), now) : 'Смена не открыта'}</h2><p>{data.activeShift ? `Начало ${formatDateTime(data.activeShift.startedAt)}` : 'Откройте смену, чтобы начать работу.'}</p></div>{#if data.activeShift}<button class="button outline" onclick={() => showReport = true}>Закрыть смену</button>{:else}<form method="POST" action="?/openShift"><button class="button primary">Открыть смену</button></form>{/if}</div>{/if}
				<div class="section-card">
					<div class="section-card-head shift-history-head"><div><h2>История смен</h2><p>Время, количество записей и сумма</p></div>{#if data.isAdmin}<div class="search-box"><Search size={17} /><input bind:value={shiftSearch} placeholder="Поиск по оператору или дате" aria-label="Поиск смен" /></div>{/if}</div>
					{#if filteredShifts.length}
						<div class="table-wrap"><table><thead><tr>{#if data.isAdmin}<th>Оператор</th>{/if}<th>Начало</th><th>Окончание</th><th>Длительность</th><th>Записей</th><th>Выручка</th><th>Средний чек</th></tr></thead><tbody>{#each filteredShifts as shift}<tr>{#if data.isAdmin}<td><strong>{shift.operatorName}</strong></td>{/if}<td>{formatDateTime(shift.startedAt)}</td><td>{shift.endedAt ? formatDateTime(shift.endedAt) : 'Открыта'}</td><td>{duration(new Date(shift.startedAt).getTime(), shift.endedAt ? new Date(shift.endedAt).getTime() : now)}</td><td>{shift.count}</td><td class="price-cell">{money(shift.total)}</td><td>{money(shift.count ? Math.round(shift.total / shift.count) : 0)}</td></tr>{/each}</tbody></table></div>
					{:else if shiftSearch.trim()}
						<div class="empty-state"><Search size={28} /><strong>Смены не найдены</strong><span>Попробуйте изменить поисковый запрос.</span></div>
					{:else}
						<div class="empty-state"><Clock3 size={28} /><strong>Смен пока нет</strong><span>История появится после первой открытой смены.</span></div>
					{/if}
				</div>
			{:else if view === 'operators' && data.isAdmin}
				<div class="page-heading"><div><div class="eyebrow">КОМАНДА</div><h1>Операторы</h1><p>Создавайте аккаунты и выдавайте сотрудникам данные для входа.</p></div><button class="button primary" onclick={() => showOperator = true}><Plus size={18} /> Добавить оператора</button></div>
				{#if credentials}<div class="credentials-card"><div><span class="eyebrow">НОВЫЙ СОТРУДНИК</span><h2>Данные для входа созданы</h2><p>Скопируйте и передайте их сотруднику. Пароль больше не будет показан.</p></div><div class="credentials-grid"><div><span>Имя</span><strong>{credentials.name}</strong></div><div><span>Логин</span><strong>{credentials.login}</strong></div><div><span>Пароль</span><strong>{credentials.password}</strong></div><div><span>Код сотрудника</span><strong>{credentials.staffCode}</strong></div></div><button class="button outline" onclick={() => copy(`Beauty CRM\nЛогин: ${credentials.login}\nПароль: ${credentials.password}\nКод сотрудника: ${credentials.staffCode}`)}><Copy size={17} />{copied ? 'Скопировано' : 'Скопировать все данные'}</button></div>{/if}
				<div class="section-card operator-list">
					<div class="section-card-head"><div><h2>Список операторов</h2><p>Всего сотрудников: {data.operatorPagination.total}</p></div></div>
					<form method="GET" action="/app" class="operator-search-row">
						<input type="hidden" name="view" value="operators" />
						<div class="search-box"><Search size={17} /><input name="operatorSearch" value={data.operatorPagination.query} placeholder="Имя, логин или код сотрудника" aria-label="Поиск оператора" /></div>
						<button class="button outline" type="submit">Найти</button>
						{#if data.operatorPagination.query}<a class="operator-search-reset" href="/app?view=operators">Сбросить</a>{/if}
					</form>
					{#if data.operators.length}
						<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Логин</th><th>Код сотрудника</th><th>Добавлен</th><th>Статус</th></tr></thead><tbody>{#each data.operators as operator}<tr><td><div class="operator-person"><span class="avatar">{operator.name.slice(0, 1).toUpperCase()}</span><strong>{operator.name}</strong></div></td><td>@{operator.username}</td><td class="operator-code">{operator.staffCode ?? '—'}</td><td>{formatDate(operator.createdAt)}</td><td><span class={`status ${operator.banned ? 'status-cancelled' : 'status-confirmed'}`}>{operator.banned ? 'Заблокирован' : 'Активен'}</span></td></tr>{/each}</tbody></table></div>
						<div class="operator-list-footer"><span>Показаны {(data.operatorPagination.page - 1) * data.operatorPagination.pageSize + 1}–{Math.min(data.operatorPagination.page * data.operatorPagination.pageSize, data.operatorPagination.total)} из {data.operatorPagination.total}</span><div>{#if data.operatorPagination.page > 1}<a class="button outline" href={operatorPageUrl(data.operatorPagination.page - 1)}>Назад</a>{/if}<span>Страница {data.operatorPagination.page} из {data.operatorPagination.pages}</span>{#if data.operatorPagination.page < data.operatorPagination.pages}<a class="button outline" href={operatorPageUrl(data.operatorPagination.page + 1)}>Далее</a>{/if}</div></div>
					{:else if data.operatorPagination.query}
						<div class="empty-state"><Search size={28} /><strong>Операторы не найдены</strong><span>Проверьте имя, логин или код сотрудника.</span></div>
					{:else}
						<div class="empty-state"><UsersRound size={28} /><strong>Операторов пока нет</strong><span>Добавьте первого сотрудника, чтобы выдать ему доступ.</span></div>
					{/if}
				</div>
			{:else if view === 'settings' && data.isAdmin}
				<div class="page-heading"><div><div class="eyebrow">СПРАВОЧНИКИ</div><h1>Салоны и услуги</h1><p>Данные, которые доступны операторам при создании записи.</p></div></div>
				<div class="settings-grid"><div class="section-card settings-card"><div class="section-card-head"><div><h2>Салоны</h2><p>{data.salons.length} в справочнике</p></div><MapPin size={20} /></div><div class="simple-list">{#each data.salons as item}<div>{item.name}</div>{/each}</div><form method="POST" action="?/createSalon" class="inline-form"><input name="name" placeholder="Название нового салона" required minlength="2" /><button class="button primary" type="submit"><Plus size={17} /> Добавить</button></form></div><div class="section-card settings-card"><div class="section-card-head"><div><h2>Услуги</h2><p>{data.services.length} в справочнике</p></div><Scissors size={20} /></div><div class="simple-list">{#each data.services as item}<div><span>{item.name}</span><strong>{money(item.defaultPrice)}</strong></div>{/each}</div><form method="POST" action="?/createService" class="inline-form stack-on-small"><input name="name" placeholder="Название услуги" required minlength="2" /><input name="defaultPrice" type="number" min="0" placeholder="Стоимость, ₽" aria-label="Стоимость услуги в рублях" required /><button class="button primary" type="submit"><Plus size={17} /> Добавить</button></form></div><div class="section-card settings-card"><div class="section-card-head"><div><h2>Мастера</h2><p>{data.masters.length} в справочнике</p></div><UsersRound size={20} /></div><div class="simple-list">{#each data.masters as item}<div><span>{item.name}</span><small>{data.salons.find((salon) => salon.id === item.salonId)?.name}</small></div>{/each}</div><form method="POST" action="?/createMaster" class="inline-form stack-on-small"><input name="name" placeholder="Имя мастера" required minlength="2" /><select name="salonId" required><option value="">Салон</option>{#each data.salons as salon}<option value={salon.id}>{salon.name}</option>{/each}</select><button class="button primary" type="submit"><Plus size={17} /> Добавить</button></form></div></div>
			{:else if view === 'profile'}
				<div class="page-heading"><div><div class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</div><h1>Мой профиль</h1><p>Ваши данные для работы в системе.</p></div></div><div class="profile-card section-card"><div class="profile-head"><span class="avatar extra-large">{data.current.name.slice(0, 1).toUpperCase()}</span><div><h2>{data.current.name}</h2><span>{data.isAdmin ? 'Администратор' : 'Оператор'}</span></div></div><div class="profile-fields"><div><span>Имя сотрудника</span><strong>{data.current.name}</strong></div><div><span>Логин</span><strong>{data.current.username}</strong></div><div><span>Код сотрудника</span><strong>{data.current.staffCode || 'Не требуется'}</strong></div><div><span>Роль</span><strong>{data.isAdmin ? 'Администратор' : 'Оператор'}</strong></div></div>{#if !data.isAdmin && data.activeShift}<button class="button outline" onclick={() => showReport = true}><LogOut size={17} /> Выйти из аккаунта</button>{:else}<form method="POST" action="?/signOut"><button class="button outline"><LogOut size={17} /> Выйти из аккаунта</button></form>{/if}</div>
			{/if}
		</div>
	</main>
</div>

{#if showCreate}<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) showCreate = false; }}><div class="modal wide" role="dialog" aria-modal="true" aria-label="Новая запись"><div class="modal-head"><div><div class="eyebrow">ДОБАВЛЕНИЕ</div><h2>Новая запись</h2><p>Заполните информацию о визите клиента.</p></div><button class="icon-button" aria-label="Закрыть" onclick={() => showCreate = false}><X size={20} /></button></div><form method="POST" action="?/createAppointment" class="modal-form"><div class="form-grid"><label><span>Имя клиента *</span><input name="clientName" placeholder="Например, Анна Смирнова" required minlength="2" /></label><label><span>Телефон *</span><input name="clientPhone" type="tel" placeholder="+7 (999) 000-00-00" required /></label><label><span>Услуга *</span><select name="serviceId" bind:value={newServiceId} onchange={() => newPrice = String(data.services.find((item) => item.id === newServiceId)?.defaultPrice ?? 0)} required><option value="">Выберите услугу</option>{#each data.services.filter((item) => item.active) as service}<option value={service.id}>{service.name}</option>{/each}</select></label><label><span>Салон *</span><select name="salonId" bind:value={newSalonId} onchange={() => newMasterId = ''} required><option value="">Выберите салон</option>{#each data.salons as salon}<option value={salon.id}>{salon.name}</option>{/each}</select></label><label><span>Мастер</span><select name="masterId" bind:value={newMasterId}><option value="">Без мастера</option>{#each data.masters.filter((item) => item.active && item.salonId === newSalonId) as master}<option value={master.id}>{master.name}</option>{/each}</select></label><label><span>Дата и время визита *</span><input type="datetime-local" bind:value={newVisitAt} required /><input type="hidden" name="visitAt" value={isoFromLocal(newVisitAt)} /></label><label><span>Статус оплаты *</span><select name="paymentStatus"><option value="pending">Ожидает оплаты</option><option value="paid">Оплачено</option><option value="deposit_half">Предоплата 50%</option></select></label><label><span>Стоимость услуги, ₽ *</span><input name="price" type="number" min="0" bind:value={newPrice} required /></label><label><span>Источник обращения</span><select name="source"><option value="call">Звонок</option><option value="instagram">Instagram</option><option value="website">Сайт</option><option value="recommendation">Рекомендация</option><option value="walk_in">Пришёл сам</option></select></label><label class="full"><span>Комментарий</span><textarea name="comment" rows="3" placeholder="Дополнительная информация для салона"></textarea></label></div><div class="modal-actions"><button class="button ghost" type="button" onclick={() => showCreate = false}>Отмена</button><button class="button primary" type="submit"><Plus size={17} /> Создать запись</button></div></form></div></div>{/if}

{#if detail}<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) detail = null; }}><div class="modal" role="dialog" aria-modal="true" aria-label="Детали записи"><div class="modal-head"><div><div class="eyebrow">КАРТОЧКА ЗАПИСИ</div><h2>{detail.clientName}</h2><p>{formatDateTime(detail.visitAt)}</p></div><button class="icon-button" aria-label="Закрыть" onclick={() => detail = null}><X size={20} /></button></div><div class="detail-body"><span class={`status status-${detail.status}`}>{statusLabels[detail.status]}</span><div class="detail-row"><Phone size={17} /><span>Телефон</span><strong>{detail.clientPhone}</strong></div><div class="detail-row"><Scissors size={17} /><span>Услуга</span><strong>{detail.serviceName}</strong></div><div class="detail-row"><MapPin size={17} /><span>Салон</span><strong>{detail.salonName}</strong></div><div class="detail-row"><UserRound size={17} /><span>Мастер</span><strong>{detail.masterName || 'Не назначен'}</strong></div><div class="detail-row"><CreditCard size={17} /><span>Стоимость</span><strong>{money(detail.price)}</strong></div><div class="detail-row"><Check size={17} /><span>Оплата</span><strong>{paymentLabels[detail.paymentStatus]}</strong></div><div class="detail-row"><ArrowUpRight size={17} /><span>Источник</span><strong>{sourceLabels[detail.source]}</strong></div><div class="detail-row"><UsersRound size={17} /><span>Создал</span><strong>{detail.operatorName}</strong></div>{#if detail.comment}<div class="detail-comment"><span>Комментарий</span><p>{detail.comment}</p></div>{/if}</div>{#if data.isAdmin}<div class="detail-actions"><div class="status-actions">{#if detail.status === 'new'}<form method="POST" action="?/setStatus"><input type="hidden" name="id" value={detail.id} /><input type="hidden" name="status" value="confirmed" /><button class="button primary"><Check size={17} /> Подтвердить</button></form>{/if}{#if detail.status !== 'cancelled' && detail.status !== 'completed'}<form method="POST" action="?/setStatus"><input type="hidden" name="id" value={detail.id} /><input type="hidden" name="status" value="cancelled" /><button class="button outline">Отменить запись</button></form>{/if}</div><div class="status-actions"><button class="button ghost" onclick={() => detail && openEdit(detail)}><Pencil size={16} /> Изменить</button><form method="POST" action="?/deleteAppointment" onsubmit={(event) => { if (!confirm('Удалить эту запись?')) event.preventDefault(); }}><input type="hidden" name="id" value={detail.id} /><button class="button danger"><Trash2 size={16} /> Удалить</button></form></div></div>{/if}</div></div>{/if}

{#if editing}<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) editing = null; }}><div class="modal wide" role="dialog" aria-modal="true" aria-label="Изменить запись"><div class="modal-head"><div><div class="eyebrow">РЕДАКТИРОВАНИЕ</div><h2>Изменить запись</h2><p>Обновите данные клиента или перенесите визит.</p></div><button class="icon-button" aria-label="Закрыть" onclick={() => editing = null}><X size={20} /></button></div><form method="POST" action="?/updateAppointment" class="modal-form"><input type="hidden" name="id" value={editing.id} /><div class="form-grid"><label><span>Имя клиента *</span><input name="clientName" value={editing.clientName} required /></label><label><span>Телефон *</span><input name="clientPhone" value={editing.clientPhone} required /></label><label><span>Услуга *</span><select name="serviceId" bind:value={editServiceId}>{#each data.services as service}<option value={service.id}>{service.name}</option>{/each}</select></label><label><span>Салон *</span><select name="salonId" bind:value={editSalonId} onchange={() => editMasterId = ''}>{#each data.salons as salon}<option value={salon.id}>{salon.name}</option>{/each}</select></label><label><span>Мастер</span><select name="masterId" bind:value={editMasterId}><option value="">Без мастера</option>{#each data.masters.filter((item) => item.salonId === editSalonId) as master}<option value={master.id}>{master.name}</option>{/each}</select></label><label><span>Дата и время визита *</span><input type="datetime-local" bind:value={editVisitAt} required /><input type="hidden" name="visitAt" value={isoFromLocal(editVisitAt)} /></label><label><span>Статус оплаты *</span><select name="paymentStatus" value={editing.paymentStatus}><option value="pending">Ожидает оплаты</option><option value="paid">Оплачено</option><option value="deposit_half">Предоплата 50%</option></select></label><label><span>Стоимость, ₽ *</span><input name="price" type="number" min="0" bind:value={editPrice} required /></label><label><span>Источник</span><select name="source" value={editing.source}>{#each Object.entries(sourceLabels) as [key, label]}<option value={key}>{label}</option>{/each}</select></label><label class="full"><span>Комментарий</span><textarea name="comment" rows="3">{editing.comment}</textarea></label></div><div class="modal-actions"><button class="button ghost" type="button" onclick={() => editing = null}>Отмена</button><button class="button primary" type="submit">Сохранить изменения</button></div></form></div></div>{/if}

{#if showOperator}<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) showOperator = false; }}><div class="modal" role="dialog" aria-modal="true" aria-label="Новый оператор"><div class="modal-head"><div><div class="eyebrow">КОМАНДА</div><h2>Новый оператор</h2><p>Код сотрудника будет создан автоматически.</p></div><button class="icon-button" aria-label="Закрыть" onclick={() => showOperator = false}><X size={20} /></button></div><form method="POST" action="?/createOperator" class="modal-form"><div class="form-stack"><label><span>Имя сотрудника</span><input name="name" placeholder="Например, Мария Иванова" minlength="2" required /></label><label><span>Логин</span><input name="login" placeholder="maria.ivanova" pattern={'[a-zA-Z0-9._]{3,32}'} required /><small>Латиница, цифры, точка или подчёркивание</small></label><label><span>Пароль</span><input name="password" type="text" minlength="8" maxlength="128" placeholder="Не менее 8 символов" required /></label></div><div class="modal-actions"><button class="button ghost" type="button" onclick={() => showOperator = false}>Отмена</button><button class="button primary" type="submit"><Plus size={17} /> Создать аккаунт</button></div></form></div></div>{/if}

{#if showReport && data.activeShift}<div class="modal-backdrop" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-label="Итоговый отчёт о смене"><div class="modal-head"><div><div class="eyebrow">ИТОГИ РАБОТЫ</div><h2>Отчёт о смене</h2><p>Скопируйте отчёт перед завершением смены.</p></div><button class="icon-button" aria-label="Закрыть" onclick={() => showReport = false}><X size={20} /></button></div><div class="report-body"><div class="report-grid"><div><span>Начало смены</span><strong>{formatDateTime(data.activeShift.startedAt)}</strong></div><div><span>Окончание</span><strong>{formatDateTime(new Date(now))}</strong></div><div><span>Время работы</span><strong>{duration(new Date(data.activeShift.startedAt).getTime(), now)}</strong></div><div><span>Создано записей</span><strong>{data.summary.count}</strong></div><div><span>Выручка за смену</span><strong>{money(data.summary.total)}</strong></div><div><span>Средний чек</span><strong>{money(data.summary.average)}</strong></div></div><p class="hint">Сумма и средний чек рассчитаны по стоимости записей, созданных за смену.</p><button class="button outline copy-report" onclick={() => copy(reportText)}><Copy size={17} /> {copied ? 'Скопировано' : 'Скопировать для куратора'}</button></div><div class="modal-actions"><button class="button ghost" onclick={() => showReport = false}>Продолжить смену</button><form method="POST" action="?/closeShift"><button class="button primary" type="submit">Закрыть смену и выйти</button></form></div></div></div>{/if}

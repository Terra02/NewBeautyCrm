<script lang="ts">
	import { ArrowRight, LockKeyhole, UserRound } from '@lucide/svelte';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let showCode = $state(false);
	let login = $state('');
	$effect(() => { if (form && 'login' in form && form.login && !login) login = String(form.login); });
</script>

<svelte:head>
	<title>Вход — Beauty CRM</title>
	<meta name="description" content="Рабочий кабинет для управления записями и сменами" />
</svelte:head>

<div class="login-shell">
	<section class="login-aside">
		<div class="brand brand-on-dark"><span>Beauty <small>CRM</small></span></div>
		<div class="login-aside-copy">
			<div class="eyebrow light">РАБОЧЕЕ ПРОСТРАНСТВО</div>
			<h1>Всё важное<br />в одном ритме.</h1>
			<p>Записи клиентов, смены операторов и работа команды в спокойном и понятном интерфейсе.</p>
		</div>
		<div class="login-aside-bottom"><span class="aside-line"></span><span>Управление салоном без лишней сложности</span></div>
	</section>
	<section class="login-main">
		<div class="login-panel">
			<div class="mobile-brand brand"><span>Beauty <small>CRM</small></span></div>
			<div class="eyebrow">ДОБРО ПОЖАЛОВАТЬ</div>
			<h2>Вход в кабинет</h2>
			<p class="muted login-lead">Используйте данные, которые выдал администратор.</p>
			{#if form && 'message' in form && form.message}<div class="alert error">{form.message}</div>{/if}
			<form method="POST" class="form-stack">
				<label><span>Логин</span><div class="input-icon"><UserRound size={18} /><input name="login" autocomplete="username" placeholder="Ваш логин" bind:value={login} required /></div></label>
				<label><span>Пароль</span><div class="input-icon"><LockKeyhole size={18} /><input type="password" name="password" autocomplete="current-password" placeholder="Введите пароль" required /></div></label>
				{#if showCode}
					<label><span>Код сотрудника</span><div class="input-icon"><span class="hash-icon">#</span><input name="staffCode" inputmode="numeric" autocomplete="off" placeholder="6 цифр" required /></div></label>
				{:else}
					<input type="hidden" name="staffCode" value="" />
				{/if}
				<label class="check-line"><input type="checkbox" bind:checked={showCode} /><span>Я вхожу как оператор</span></label>
				<button class="button primary login-submit" type="submit">Войти в систему <ArrowRight size={18} /></button>
			</form>
			<p class="login-help">Нет доступа? Обратитесь к администратору вашей команды.</p>
		</div>
	</section>
</div>

import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	jsonb
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema';

export const salons = pgTable('salons', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	timezone: text('timezone').notNull().default('Europe/Moscow'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('salons_name_unique').on(table.name)]);

export const services = pgTable('services', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	durationMinutes: integer('duration_minutes').notNull().default(60),
	defaultPrice: integer('default_price').notNull().default(0),
	active: boolean('active').notNull().default(true)
}, (table) => [uniqueIndex('services_name_unique').on(table.name)]);

export const masters = pgTable('masters', {
	id: uuid('id').primaryKey().defaultRandom(),
	salonId: uuid('salon_id').notNull().references(() => salons.id),
	name: text('name').notNull(),
	active: boolean('active').notNull().default(true)
}, (table) => [index('masters_salon_idx').on(table.salonId)]);

export const staffProfiles = pgTable('staff_profiles', {
	userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
	staffCode: text('staff_code').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('staff_code_unique').on(table.staffCode)]);

export const shifts = pgTable('shifts', {
	id: uuid('id').primaryKey().defaultRandom(),
	operatorId: text('operator_id').notNull().references(() => user.id),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	endedAt: timestamp('ended_at', { withTimezone: true })
}, (table) => [
	index('shifts_operator_started_idx').on(table.operatorId, table.startedAt),
	uniqueIndex('shifts_one_open_per_operator').on(table.operatorId).where(sql`${table.endedAt} is null`)
]);

export const appointments = pgTable('appointments', {
	id: uuid('id').primaryKey().defaultRandom(),
	operatorId: text('operator_id').notNull().references(() => user.id),
	shiftId: uuid('shift_id').references(() => shifts.id),
	salonId: uuid('salon_id').notNull().references(() => salons.id),
	masterId: uuid('master_id').references(() => masters.id),
	serviceId: uuid('service_id').notNull().references(() => services.id),
	clientName: text('client_name').notNull(),
	clientPhone: text('client_phone').notNull(),
	comment: text('comment').notNull().default(''),
	visitAt: timestamp('visit_at', { withTimezone: true }).notNull(),
	price: integer('price').notNull(),
	paymentStatus: text('payment_status').notNull().default('pending'),
	status: text('status').notNull().default('new'),
	source: text('source').notNull().default('call'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	index('appointments_operator_created_idx').on(table.operatorId, table.createdAt),
	index('appointments_visit_idx').on(table.visitAt),
	index('appointments_salon_visit_idx').on(table.salonId, table.visitAt)
]);

export const appointmentEvents = pgTable('appointment_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	appointmentId: uuid('appointment_id').notNull().references(() => appointments.id, { onDelete: 'cascade' }),
	actorId: text('actor_id').references(() => user.id),
	action: text('action').notNull(),
	details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [index('appointment_events_appointment_idx').on(table.appointmentId, table.createdAt)]);

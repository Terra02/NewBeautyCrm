import { betterAuth } from 'better-auth/minimal';
import { admin, username } from 'better-auth/plugins';

// Schema-only config. Keep its plugins in sync with src/lib/server/auth.ts.
export const auth = betterAuth({
	emailAndPassword: { enabled: true },
	plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32 }), admin()]
});

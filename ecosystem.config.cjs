module.exports = {
	apps: [
		{
			name: 'beauty-crm',
			script: 'build/index.js',
			cwd: __dirname,
			interpreter: 'node',
			node_args: '--env-file=.env',
			instances: 1,
			exec_mode: 'fork',
			time: true,
			env: {
				NODE_ENV: 'production',
				HOST: '127.0.0.1',
				PORT: '3000'
			}
		}
	]
};

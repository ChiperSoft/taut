'use strict';

/**
 * App configuration loader. Uses the `rc` package to find json
 * based config files (see package docs for details), with a set of development defaults.
 */

var pkg  = require('./pkg');
var rc   = require('rc');
var path = require('path');
var defaultsDeep = require('lodash/object/defaultsDeep');

var appConfig = rc(pkg.name, {
	name: pkg.name,
	version: pkg.version,

	concourse: {
		port: 8000,
		visitorHeartbeat: 30,
		visitorExpire: 60 * 15
	},

	gangway: {
		heartbeat: 30
	},

	tarmac: {
		control: {
			port: 56001,
			host: '127.0.0.1'
		},
		identurl: 'http://localhost:10110/{{username}}/{{port}}',
		heartbeat: 30,
		maxConnectionsPerWorker: 1
	},

	tower: {
		control: {
			port: 56001,
			host: '127.0.0.1'
		},
		launchWait: 10,
		minimumOpenSeats: 1,
		maximumOpenSeats: 2,
		maximumTotalSeats: 20,
		maximumReconnect: {
			timeout: 60000 * 5,
			count: 3
		},
		tarmacLaunch: {
			bin: path.join(path.dirname(require.main.filename), '..', '..', 'tarmac', 'bin', 'taut-tarmac'),
			out: path.join(path.dirname(require.main.filename), '..', '..', 'logs', 'tarmac.log'),
			err: path.join(path.dirname(require.main.filename), '..', '..', 'logs', 'tarmac.log'),
			env: {
				DEBUG: 'taut.tarmac:*'
			}
		}
	},

	alerts: {
		target: 'chiper@chipersoft.com',
		wait: 10000,
		maxWait: 120000
	}
});

var siteConfig = rc('taut', {
	io: {
		redis: {
			port: 6379,
			host: '127.0.0.1',
			auth: false
		},
		mysql: {
			host: '127.0.0.1',
			user: 'vagrant',
			password: 'vagrant',
			database: 'taut',
			connectionLimit: 2
		},
		elasticsearch: {
			host: 'localhost:9200'
		},
		email: {
			method: 'console'
		},
		mq: {
			redis: ['redis://127.0.0.1:6379']
		}
	},

	userEncryptionKey: 'ktiR9MQ87rPH4Kk6dtmLR6A9vpe8Y32T',

	newrelic: {
		disabled: false,
		NEW_RELIC_LICENSE_KEY: '',
		NEW_RELIC_APP_NAME: pkg.name
	}
});

var config = defaultsDeep(appConfig, siteConfig);

module.exports = config;

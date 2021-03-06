
var test = require('tape');
var sequential = require('../../testing/sequential');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var Promise = require('bluebird');

test('models/user', function (tr) {

	tr.test('.get(userid)', function (t) {
		t.plan(3);

		var EXPECTED = { userid: 'USERID' };

		var Model = proxyquire('../../models/user', {
			'./user/is-agent': { '@noCallThru': true },
			'../io/redis': {
				'hgetall': function (key, target) {
					t.equal(key, 'user:USERID');
					t.notOk(target, 'Hash target was not supplied');
					return Promise.resolve(EXPECTED);
				},
				'@noCallThru': true
			}
		});

		Model.get('USERID')
			.then(function (result) {
				t.same(result, EXPECTED);
			})
			.catch(t.fail)
			.then(t.end);
	});

	tr.test('.get(userid, hashkey)', function (t) {
		t.plan(3);
		var EXPECTED = { userid: 'USERID' };

		var Model = proxyquire('../../models/user', {
			'./user/is-agent': { '@noCallThru': true },
			'../io/redis': {
				'hget': function (key, target) {
					t.equal(key, 'user:USERID');
					t.equal(target, 'HASHKEY');
					return Promise.resolve(EXPECTED);
				},
				'@noCallThru': true
			}
		});

		Model.get('USERID', 'HASHKEY')
			.then(function (result) {
				t.same(result, EXPECTED);
			})
			.catch(t.fail)
			.then(t.end);
	});

	tr.test('.set(userid, hashkey, value)', function (t) {
		t.plan(4);

		var Model = proxyquire('../../models/user', {
			'./user/is-agent': { '@noCallThru': true },
			'../io/redis': {
				'hset': function (key, target, value) {
					t.equal(key, 'user:USERID');
					t.equal(target, 'HASHKEY');
					t.equal(value, 'VALUE');
					return Promise.resolve();
				},
				'@noCallThru': true
			}
		});

		Model.set('USERID', 'HASHKEY', 'VALUE')
			.then(function () {
				t.pass('promise resolved');
			})
			.catch(t.fail)
			.then(t.end);
	});

	tr.test('.set(userid, object)', function (t) {
		t.plan(4);

		var PASSING = { somevalue: 42 };

		var Model = proxyquire('../../models/user', {
			'./user/is-agent': { '@noCallThru': true },
			'../io/redis': {
				'hmset': function (key, target, value) {
					t.equal(key, 'user:USERID');
					t.same(target, PASSING);
					t.notOk(value, 'Value received something');
					return Promise.resolve();
				},
				'@noCallThru': true
			}
		});

		Model.set('USERID', PASSING)
			.then(function () {
				t.pass('promise resolved');
			})
			.catch(t.fail)
			.then(t.end);
	});

	tr.test('.set(userid, "is_agent", true)', function (t) {
		t.plan(6);

		var Model = proxyquire('../../models/user', {
			'./user/is-agent': {
				set: function (userid, value) {
					t.equal(userid, 'USERID');
					t.equal(value, true);
					return Promise.resolve();
				},
				'@noCallThru': true
			},
			'../io/redis': {
				'hset': function (key, target, value) {
					t.equal(key, 'user:USERID');
					t.equal(target, 'is_agent');
					t.equal(value, true);
					return Promise.resolve();
				},
				'@noCallThru': true
			}
		});

		Model.set('USERID', 'is_agent', true)
			.then(function () {
				t.pass('promise resolved');
			})
			.catch(t.fail)
			.then(t.end);
	});

	tr.test('.set(userid, object)', function (t) {
		t.plan(6);

		var PASSING = { is_agent: false };

		var Model = proxyquire('../../models/user', {
			'./user/is-agent': {
				set: function (userid, value) {
					t.equal(userid, 'USERID');
					t.equal(value, false);
					return Promise.resolve();
				},
				'@noCallThru': true
			},
			'../io/redis': {
				'hmset': function (key, target, value) {
					t.equal(key, 'user:USERID');
					t.same(target, PASSING);
					t.notOk(value, 'Value received something');
					return Promise.resolve();
				},
				'@noCallThru': true
			}
		});

		Model.set('USERID', PASSING)
			.then(function () {
				t.pass('promise resolved');
			})
			.catch(t.fail)
			.then(t.end);
	});

	tr.test('ensureUniqueId', function (t1) {

		t1.test('no collision', function (t) {
			t.plan(3);

			var hget = sequential();
			hget.onFirstCall(function (key, target) {
				t.equal(key.substr(0, 5), 'user:');
				t.equal(target, 'userid');
				return Promise.resolve(null);
			});

			hget.onSecondCall(function () {
				t.fail('should not have called get twice');
			});

			var Model = proxyquire('../../models/user', {
				'./user/is-agent': { '@noCallThru': true },
				'../io/redis': {
					'hget': hget,
					'@noCallThru': true
				}
			});

			Model._ensureUniqueId()
				.then(function (result) {
					t.equal(typeof result, 'string', 'got back an ID: ' + result);
				})
				.catch(t.fail)
				.then(t.end);
		});

		t1.test('1 collision', function (t) {
			t.plan(6);

			var firstTry;
			var hget = sequential();
			hget.onFirstCall(function (key, target) {
				firstTry = key;
				t.equal(key.substr(0, 5), 'user:');
				t.equal(target, 'userid');
				return Promise.resolve(key.substr(5));
			});

			hget.onSecondCall(function (key, target) {
				t.equal(key.substr(0, 5), 'user:');
				t.equal(target, 'userid');
				t.notEqual(key, firstTry, 'did not get the same key');
				return Promise.resolve(null);
			});

			hget.onThirdCall(function () {
				t.fail('should not have called get twice');
			});

			var Model = proxyquire('../../models/user', {
				'./user/is-agent': { '@noCallThru': true },
				'../io/redis': {
					'hget': hget,
					'@noCallThru': true
				}
			});

			Model._ensureUniqueId()
				.then(function (result) {
					t.equal(typeof result, 'string', 'got back an ID: ' + result);
				})
				.catch(t.fail)
				.then(t.end);
		});

		t1.end();
	});

	tr.test('.create()', function (t) {
		t.plan(8);

		var clock = sinon.useFakeTimers(Date.now());

		var userid;
		var expected;
		var Model = proxyquire('../../models/user', {
			'./user/is-agent': {
				'set': function (uid, value) {
					t.equal(uid, userid);
					t.equal(value, false);
					return Promise.resolve();
				},
				'@noCallThru': true
			},
			'../io/redis': {
				'hget': function (key) {
					t.ok('attempted to get key');
					userid = key.substr(5);
					return Promise.resolve(null);
				},
				'hmset': function (key, actual) {
					expected = {
						userid: userid,
						date_created: new Date(),
						is_agent: false
					};
					t.equal(key, 'user:' + userid, 'storing in the correct place');
					t.same(actual, expected);
					return Promise.resolve();
				},
				'hgetall': function (key, target) {
					t.equal(key, 'user:' + userid);
					t.notOk(target, 'Hash target was not supplied');
					return Promise.resolve(expected);
				},
				'@noCallThru': true
			}
		});

		Model.create()
			.then(function () {
				t.pass('promise resolved');
			})
			.catch(t.fail)
			.then(clock.restore.bind(clock))
			.then(t.end);

	});

	tr.end();
});

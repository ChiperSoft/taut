
var redis = require('../../io/redis');
var memoize = require('memoizesync');

module.exports = exports = memoize(function (userid) {
	return exports.get(userid);
}, { maxAge: 60000 });

function key () {
	return 'users:agents';
}

exports.get = function (userid) {
	if (userid) {
		return redis.sismember(key(), userid);
	}
	return redis.smembers(key());
};

exports.set = function (userid, enable) {
	if (enable) {
		return redis.sadd(key(), userid);
	}

	return redis.srem(key(), userid);
};

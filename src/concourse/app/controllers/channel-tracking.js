
var each       = require('lodash/collection/each');
var debug      = require('finn.shared/debug')('channel-tracking');
var pubsub     = require('finn.shared/io/pubsub');
var irchistory = require('finn.shared/models/system/irc/history');
var cache      = require('../controllers/rolling-cache');
var Emitter    = require('events').EventEmitter;

var EXPIRE_TRACKING_AFTER = 5 * 60000;

module.exports = exports = new Emitter();


var subscriberCounts = {};

// we have to listen for removeLister first, so that adding it doesn't trigger newListener
exports.on('removeListener', function (channel) {
	// if subscriber count for that channel is already 0 or undefined
	// then there is no need to timeout the tracking
	if (!subscriberCounts[channel]) return;

	subscriberCounts[channel]--;

	exports.cycleExpireTimer(channel);
});

exports.on('newListener', function (channel) {
	exports.startTracking();

	// subscriberCounts[channel] might be undefined, so we can't just ++
	subscriberCounts[channel] = (subscriberCounts[channel] || 0) + 1;

	exports.cycleExpireTimer(channel);
});


/********************************************************************************************************************/

var trackingTimeouts = {};

exports.cycleExpireTimer = function (channel) {
	if (trackingTimeouts[channel]) {
		debug('stopping expiration timer', channel);
		clearTimeout(trackingTimeouts[channel]);
		trackingTimeouts[channel] = undefined;
	}

	// if there are still subscribers, no need to start the timer
	if (subscriberCounts[channel]) return;

	debug('starting expiration timer', channel);
	trackingTimeouts[channel] = setTimeout(function () {
		if (subscriberCounts[channel]) return;
		exports.stopTracking(channel);
	}, EXPIRE_TRACKING_AFTER);
};


/********************************************************************************************************************/


var trackingCallbacks = {};

exports.startTracking = function (channel) {
	if (trackingCallbacks[channel]) return true;

	var cb = trackingCallbacks[channel] = function (event, data) {
		cache.push(data);
		exports.emit(data.target, data);
		// debug('tracked event', data.target);
	};

	pubsub.channel('irc:public:' + channel + ':receive').on('_all', cb);
	debug('tracking started', channel);
};

exports.stopTracking = function (channel) {
	if (!trackingCallbacks[channel]) return;

	pubsub.channel('irc:public:' + channel + ':receive').removeListener('_all', trackingCallbacks[channel]);
	delete trackingCallbacks[channel];
	debug('tracking stopped', channel);
};


/********************************************************************************************************************/


exports.pageRequest = function (channel) {
	if (!exports.startTracking(channel)) {
		exports.cycleExpireTimer(channel);
	}

	return irchistory.fetchPublic(channel).then(function (events) {
		cache.push(events);
		return events;
	});
};


/********************************************************************************************************************/


process.on('graceful stop', function () {
	each(trackingCallbacks, function (cb, channel) {
		// nuke subscriber counts so the expire timer doesn't reset.
		subscriberCounts[channel] = 0;

		exports.stopTracking(channel);
	});

	exports.removeAllListeners();

	// clear any lingering timers
	each(trackingTimeouts, function (timer) {
		if (timer) clearTimeout(timer);
	});
});

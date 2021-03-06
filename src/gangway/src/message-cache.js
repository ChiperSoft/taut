
var sha1 = require('taut.shared/lib/sha1');
var throttle = require('lodash/function/throttle');

var TS_ROUND = 60000;

var byHash = {};
var byStack = [];

var cleanup = throttle(function cleanup () {
	var expire = Date.now() - (TS_ROUND * 2);
	while (byStack.length && byStack[0].processed < expire) {
		delete byHash[byStack[0].hash];
		byStack.shift();
	}
}, 10000);

function match (message) {
	message.hash  = hashPublicMessage(message, true);
	message.match = hashPublicMessage(message);

	var hash = message.match;

	var matches;
	if (!byHash[hash]) {
		matches = byHash[hash] = [];
		byStack.push(message);
	} else {
		matches = byHash[hash];
	}

	// Message is new if there's been no message with this hash, or
	// all previous messages with this hash were already seen by this connection.
	// If the message hash exists but has not been seen by this connection, mark it seen
	var isNew = !matches.length || !matches.some(function (matchedMessage) {
		if (matchedMessage.seenBy[message.userid]) {
			return false;
		}

		matchedMessage.seenBy[message.userid] = message.timestamp || Date.now();
		return true;
	});

	if (!isNew) {
		return false;
	}

	message.hashIndex = matches.length;
	message.processed = Date.now();
	message.seenBy = {};
	message.seenBy[message.userid] = true;
	matches.push(message);
	return true;
}

function hashPublicMessage (message, exact) {
	var date = parseFloat(message.timestamp);
	if (!exact) {
		date -= (date % TS_ROUND);
	}
	date = date.toString(16);

	var hash = [date, message.target, message.event, message.nick, message.message || ''].join('\t');
	return sha1(hash);
}

function hashPrivateMessage (message) {
	var date = parseFloat(message.timestamp);
	date = date.toString(16);

	var hash = [date, message.userid, message.event, message.nick, message.message || ''].join('\t');
	return sha1(hash);
}

exports.hashPublicMessage = hashPublicMessage;
exports.hashPrivateMessage = hashPrivateMessage;

exports.match = function (message) {
	var isNew = match(message);
	cleanup();
	return isNew;
};

exports.reset = function () {
	byHash = {};
	byStack = [];
};


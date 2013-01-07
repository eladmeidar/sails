var _ = require('underscore');
_.str = require('underscore.string');
var async = require('async');

// Deferred Object for chained calls like User.find(3).destroy(cb); and User.findAllByName('Mike').limit(10).done(cb);
module.exports = function (operation) {
	var self = this;

	// Create the callChain list for the first time and append the specified op
	this.callChain = [operation];
	this.terminated = false;

	// console.log("Buffering :: ",operation.collection.identity,operation.method,operation.args);
	
	//////////////////////////////////////////
	// Chained query options
	//////////////////////////////////////////
	this.limit = function (limit, cb) {
		var usage = _.str.capitalize(this.identity) + '.limit(limit, [callback])';
		if (this.terminated) usageError('Chain is already terminated!');

		applyQueryOption('limit',limit);

		// Either call done() or return the deferred object
		if(_.isFunction(cb)) return this.done(cb);
		else return this;
	};

	this.skip = function (skip, cb) {
		var usage = _.str.capitalize(this.identity) + '.skip(skip, [callback])';
		if (this.terminated) usageError('Chain is already terminated!');
		
		applyQueryOption('skip',skip);

		// Either call done() or return the deferred object
		if(_.isFunction(cb)) return this.done(cb);
		else return this;
	};

	this.sort = function (sort, cb) {
		var usage = _.str.capitalize(this.identity) + '.sort(sort, [callback])';
		if (this.terminated) usageError('Chain is already terminated!');
		
		applyQueryOption('sort',sort);

		// Either call done() or return the deferred object
		if(_.isFunction(cb)) return this.done(cb);
		else return this;
	};

	// Go back and modify the criteria to find a method that takes a criteria
	// ( the last contextual operation up the callChain )
	function applyQueryOption(name,value) {
		for (var i=self.callChain.length-1; i>=0; i--) {
			
			// As soon as context is found, extend criteria and get out
			var context = self.callChain[i].method;
			if (hasCriteria(context)) {
				self.callChain[i].args.criteria[name] = value;
				break;
			}
		}
	}


	//////////////////////////////////////////
	// Promises / Deferred Objects
	//////////////////////////////////////////


	// when done() is called (or some comparably-named terminator)
	// run every operation in the queue and trigger the callback
	this.done = function (cb) {
		// A callback is always required here, and done() can't be called more than once
		var usage = _.str.capitalize(this.identity) + '.done(callback)';
		if(!_.isFunction(cb)) usageError('Invalid callback specified!',usage);
		if (this.terminated) usageError('Chain is already terminated!');
		this.terminated = true;

		// Iterate through each operation in the call chain
		// If an error is detected, stop
		if (_.isArray(this.callChain) && this.callChain.length > 0) {

			// Used if a resultSet must be returned
			var resultSet;

			// Go through list again and actually perform logic
			async.forEachSeries(this.callChain, function (promise, cb) {
				var methodName = promise.method;
				var method = promise.collection && promise.collection[methodName];
				if (!method) cb(new Error(promise.method+' doesn\'t exist in '+promise.collection.identity));

				// Always tack on callback
				var args = [promiseCallback];

				// Push criteria on argument list
				if (hasCriteria(methodName)) {
					args.unshift(promise.args.criteria);
				}

				// Execute promise
				method.apply(promise.collection, args);
				function promiseCallback (err,data) {
					if (err) return cb(err);

					// Manage result set differently dependending on the method
					if (isFindish(methodName)) {
						if (resultSet) err = methodName + " cannot be called more than once in the same chain!";
						resultSet = data;
						return cb(err,data);
					}
					else throw new Error ('Unknown chained method: '+methodName);
				}
			}, 
			// Return result set to caller
			function (err) {
				return cb(err, resultSet);
			});
		}
		else throw new Error ('Trying to resolve a deferred object, but the call chain is invalid!');
	};
};


// Whether the function is "findish", or whether it can be used as a context promise
function isFindish(methodName) {
	return methodName.match('find');
}

// Whether the function accepts a criteria
function hasCriteria(methodName) {
	return methodName.match('find');
}
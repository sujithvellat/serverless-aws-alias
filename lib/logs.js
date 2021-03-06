'use strict';
/**
 * Log management.
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const moment = require('moment');
const os = require('os');

module.exports = {
	logsValidate() {
		// validate function exists in service
		this._lambdaName = this._serverless.service.getFunction(this.options.function).name;

		this._options.interval = this._options.interval || 1000;
		this._options.logGroupName = this._provider.naming.getLogGroupName(this._lambdaName);

		return BbPromise.resolve();
	},

	logsGetLogStreams() {
		const params = {
			logGroupName: this._options.logGroupName,
			descending: true,
			limit: 50,
			orderBy: 'LastEventTime',
		};

		// Get currently deployed function version for the alias to
		// setup the stream filter correctly
		return this.aliasGetAliasFunctionVersions(this._alias)
		.then(versions => {
			return _.map(
				_.filter(versions, [ 'functionName', this._lambdaName ]),
				version => version.functionVersion);
		})
		.then(version => {
			return this.provider
				.request('CloudWatchLogs',
					'describeLogStreams',
					params,
					this.options.stage,
					this.options.region)
				.then(reply => {
					if (!reply || _.isEmpty(reply.logStreams)) {
						throw new this.serverless.classes
							.Error('No existing streams for the function alias');
					}

					return _.map(
						_.filter(reply.logStreams, stream => _.includes(stream.logStreamName, `[${version}]`)),
						stream => stream.logStreamName);
				});
		});

	},

	logsShowLogs(logStreamNames) {
		if (!logStreamNames || !logStreamNames.length) {
			if (this.options.tail) {
				return setTimeout((() => this.logsGetLogStreams()
					.then(nextLogStreamNames => this.logsShowLogs(nextLogStreamNames))),
					this.options.interval);
			}
		}

		const formatLambdaLogEvent = (msgParam) => {
			let msg = msgParam;
			const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

			if (_.startsWith(msg, 'REPORT')) {
				msg += os.EOL;
			}

			if (_.startsWith(msg, 'START') || _.startsWith(msg, 'END') || _.startsWith(msg, 'REPORT')) {
				return chalk.gray(msg);
			} else if (_.trim(msg) === 'Process exited before completing request') {
				return chalk.red(msg);
			}

			const splitted = _.split(msg, '\t');

			if (splitted.length < 3 || new Date(splitted[0]) === 'Invalid Date') {
				return msg;
			}
			const reqId = splitted[1];
			const time = chalk.green(moment(splitted[0]).format(dateFormat));
			const text = _.split(msg, `${reqId}\t`)[1];

			return `${time}\t${chalk.yellow(reqId)}\t${text}`;
		};

		const params = {
			logGroupName: this.options.logGroupName,
			interleaved: true,
			logStreamNames,
			startTime: this.options.startTime,
		};

		if (this.options.filter) params.filterPattern = this.options.filter;
		if (this.options.nextToken) params.nextToken = this.options.nextToken;
		if (this.options.startTime) {
			const since = _.includes(['m', 'h', 'd'],
				this.options.startTime[this.options.startTime.length - 1]);
			if (since) {
				params.startTime = moment().subtract(
					_.replace(this.options.startTime, /\D/g, ''),
					_.replace(this.options.startTime, /\d/g, '')).valueOf();
			} else {
				params.startTime = moment.utc(this.options.startTime).valueOf();
			}
		}

		return this.provider
			.request('CloudWatchLogs',
				'filterLogEvents',
				params,
				this.options.stage,
				this.options.region)
			.then(results => {
				if (results.events) {
					_.forEach(results.events, e => {
						process.stdout.write(formatLambdaLogEvent(e.message));
					});
				}

				if (results.nextToken) {
					this.options.nextToken = results.nextToken;
				} else {
					delete this.options.nextToken;
				}

				if (this.options.tail) {
					if (results.events && results.events.length) {
						this.options.startTime = _.last(results.events).timestamp + 1;
					}

					return setTimeout((() => this.logsGetLogStreams()
							.then(nextLogStreamNames => this.logsShowLogs(nextLogStreamNames))),
						this.options.interval);
				}

				return BbPromise.resolve();
			});
	},

};

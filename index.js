const path = require('path');
//const netatmo = require('netatmo');
const request = require('request-promise');
const _ = require('lodash');
const moment = require('moment'); moment.locale('fr');
const spawn = require('child-process-promise').spawn;
const exec = require('child_process').exec;
const winston = require('winston');
const fs = require('fs');
const PROD = !fs.existsSync(path.join(__dirname, 'debug'));

//vcom values : 0-255
const vcom_normal = 30;
const vcom_hot = 72;
const vcom_trigger_temp = 24.5;


const cmdTimeout = 70000;
const retry_before_reboot = 3;
const outputFile = path.join(__dirname, 'out.bmp');

//warning values
const hum_min_warn = 40;
const hum_max_warn = 60;
const co2_max_warn = 1000;
const noise_max_warn = 65;
const noise_average_smoothing = 6; //6 values = 1hour

//trigger
const trigger_time_ms = 7200000; //two hours
const trigger_temp = 0.8;
const trigger_co2 = 500;
const trigger_hum = 5;


//heating
const heating_off_trigger = 20.0;
const heating_on_trigger = 19.5;

const morning_hour = 6; //trigger on ext. temp only after this hour. 

//forecast update times 
//for meteoblue : https://content.meteoblue.com/en/research-development/data-sources/weather-modelling/model-run
const forecast_update_times = ['06:00:00', '08:15:00 00Z', '18:30:00', '20:15:00 00Z']

var logger = new (winston.Logger)({
	transports: [
		new winston.transports.Console({
			level: 'debug',
			colorize: true,
			timestamp: function () {
				return moment().format('YYYY-MM-DD HH:mm:ss');
			},
			handleExceptions: true,
			humanReadableUnhandledException: true,
		}),
		new winston.transports.File({
			name: 'file#info',
			level: 'info',
			colorize: false,
			timestamp: function () {
				return moment().format('YYYY-MM-DD HH:mm:ss');
			},
			json: false,
			filename: path.join(__dirname, 'logs', 'log.log'),
			handleExceptions: true,
			humanReadableUnhandledException: true,
			maxsize: 1000000,
			maxFiles: 5,
			tailable: true
		}),
		new winston.transports.File({
			name: 'file#error',
			level: 'error',
			colorize: false,
			timestamp: function () {
				return moment().format('YYYY-MM-DD HH:mm:ss');
			},
			json: false,
			filename: path.join(__dirname, 'logs', 'error.log'),
			handleExceptions: true,
			humanReadableUnhandledException: true,
			maxsize: 1000000,
			maxFiles: 5,
			tailable: true
		})
	]
});

//load auth data
if (!fs.existsSync(path.join(__dirname, 'config.json'))) {
	throw 'config file not found, cannot continue.';
}
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));




//=========================================================================================
//load internal libs
logger.info('======================================================');

var startTime = moment();
var refreshing = false;

const led = require(path.join(__dirname, 'led'))({
	logger: logger
});
const meteoblue_ws = require(path.join(__dirname, 'meteoblue_ws'))({
	logger: logger
});
const darksky_ws = require(path.join(__dirname, 'darksky_ws'))({
	logger: logger
});

const api_server = require(path.join(__dirname, 'api_server'))({
	logger: logger,
	refreshScreenCallback: function () {
		if (refreshing) {
			logger.warn('refresh is already in progress');
		} else {
			startTime = moment();
			led.goBusyFlashing();
			sendToScreen(vcom_normal).then(function () {
				led.exitBusy();
			});
		}
	},
	fullRefreshCallback: function () {
		refresh(false);
	}
});

const bmp_gen = require(path.join(__dirname, 'bitmap_gen'))({
	logger: logger,
	outputFile: outputFile,
	getTimespan: getTimespan
});
logger.info('script launch after', getTimespan());

//set global working var
var previous_data = null;
var last_darksky_update = null;
var noise_values = [];
var noise_avg_prev = 0;
var noise_avg_curr = 0;
var fail_count = 0;



process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';



//launch process
refresh(true);


function refresh(triggerNextUpdate) {
	if (refreshing && !triggerNextUpdate) {
		logger.warn('already refreshing, exit immediately');
		return;
	}
	logger.info('------------------------------------------------------');
	startTime = moment();
	led.goBusyGreen();
	let nextUpdateTimeoutSet = false;
	getDataFromNetatmo().then(function (data_netatmo) {
		if (data_netatmo) {
			logger.info('netatmo data received after', getTimespan());

			let lastStoreTimeSpanMs = moment().diff(moment('' + data_netatmo.last_store_time, 'X')),
				lastStoreTimeSpan = moment(lastStoreTimeSpanMs);

			logger.info('last store date was', lastStoreTimeSpan.minutes() + 'm' + lastStoreTimeSpan.seconds() + 's ago');

			if (triggerNextUpdate) {
				let shouldAbort = false;
				//netatmo refresh is every 10 minutes, we make it 11 to be sure
				let triggerSpan = 660000 - lastStoreTimeSpanMs;
				if (lastStoreTimeSpanMs < 0) {
					//should never happen :/
					logger.warn('wrong timespan !', lastStoreTimeSpanMs);
					triggerSpan = -1; //hack to refresh in 30s
				}
				if (triggerSpan < 0 && triggerSpan > -300000) {
					// trigger span is negative (between 11 and 15 minutes ago), let's refresh in 30 sec, no need to go further  ! 
					logger.info('no update since between 11 and 15 minutes, retry in 30s !');
					triggerSpan = 30000;
					shouldAbort = true;
				} else if (triggerSpan < 0) {
					logger.debug('timespan ms is ', lastStoreTimeSpanMs);
					logger.debug('triggerSpan is ', triggerSpan);
					logger.info('no news for more than 15 minutes, try again in 10 minutes');
					// no news for more than 15 minutes, there is probably a problem. Lets try again in in 10 minutes. No need to go further ! 
					triggerSpan = 600000;
					shouldAbort = true;
				} else if (triggerSpan < 300000) {
					logger.warn('trigger span is less than 5 min, setting it to 5 min. tiggerSpan =', triggerSpan);
					triggerSpan = 300000;
				}
				logger.info('set timeout in ' + triggerSpan + 'ms');
				setTimeout(function () {
					refresh(true);
				}, triggerSpan);
				nextUpdateTimeoutSet = true;
				if (shouldAbort) {
					throw 'abort';
				}
				if (refreshing) {
					throw 'already_refreshing';
				}
				addNoiseToTab(data_netatmo.main_room.noise);
				if (!shouldUpdate(previous_data, data_netatmo)) {
					throw 'no_changes';
				}
			} else {
				logger.warn('Manual update : do not set trigger');
			}
			refreshing = true;
			previous_data = data_netatmo;
			commitNoiseValues();

			fail_count = 0;
			if (shouldUpdateForecast()) {
				logger.info('updating forecast...');
				return darksky_ws.getData().then(function (data_darksky) {
					logger.info('darksky data received after', getTimespan());
					last_darksky_update = moment();
					return meteoblue_ws.getData(data_darksky).then(function (data_meteoblue) {
						logger.info('meteoblue data received after', getTimespan());
						bmp_gen.drawImage(data_netatmo, data_meteoblue);
						return getVcomFromTemp(data_netatmo.main_room.temp);
					}).catch(function (e) {
						logger.warn('cannot load data from meteoblue');
						logger.warn(e);
						bmp_gen.drawImage(data_netatmo, data_darksky);
						return getVcomFromTemp(data_netatmo.main_room.temp);
					});
				}).catch(function (e) {
					logger.error('error getting forecast ! ', e);
					bmp_gen.drawImage(data_netatmo, null);
					return getVcomFromTemp(data_netatmo.main_room.temp);
				});
			} else {
				logger.info('no need to refresh forecast.');
				bmp_gen.drawImage(data_netatmo, null);
				return getVcomFromTemp(data_netatmo.main_room.temp);
			}
		} else {
			logger.error('no netatmo data :(');
		}
	}).then(function (vcom) {
		if (!vcom) {
			vcom = vcom_normal;
		}
		led.goBusyFlashing();
		return sendToScreen(vcom);
	})
		.catch(function (error) {
			if (error === 'already_refreshing') {
				logger.warn('already refreshing ! ');
			} else if (error === 'abort') {
				logger.warn('aborted ! ');
			} else if (error === 'no_changes') {
				logger.warn('no significant changes, no screen update. ');
			} else {
				fail_count++;
				logger.error('unexpected error (', fail_count, 'times)');
				logger.error(error);

				if (fail_count >= retry_before_reboot) {
					logger.warn('too much fails, rebooting');
					if (PROD) {
						exec('/sbin/reboot', function (msg) {
							logger.info(msg);
						});
					}
				}
			}
		})
		.finally(function () {
			logger.info('completed in', getTimespan());
			if (!nextUpdateTimeoutSet && triggerNextUpdate) {
				logger.warn('next update is not set, forcing it in 11m');
				setTimeout(function () {
					refresh(true);
				}, 660000);
			}
			refreshing = false;
			led.exitBusy();
		});
}

//--------------------------------------------------------------------------

//in hot contition, we have to raise vcom, otherwise screen looks gray :(
function getVcomFromTemp(temp) {
	if (temp >= vcom_trigger_temp) {
		return vcom_hot;
	}
	return vcom_normal;
}

function sendToScreen(vcom) {
	let timeout = new Promise((resolve, reject) => {
		let id = setTimeout(() => {
			resolve('command out in ' + cmdTimeout + 'ms.');
			clearTimeout(id);
		}, cmdTimeout);
	});
	logger.info('vcom is', vcom);
	logger.info('spawning python command');
	let promiseSpawn;
	if (PROD) {
		promiseSpawn = spawn('python', ['-u', path.join(__dirname, 'python/main.py'), outputFile, vcom]);
	} else {
		logger.warn('Debug mode, no real display ! ');
		promiseSpawn = spawn('sh', [path.join(__dirname, 'fake_disp.sh')]);
	}

	promiseSpawn.childProcess.stdout.on('data', function (data) {
		let dataStr = data.toString().replace(/^\s+|\s+$/g, '');
		if (dataStr) {
			logger.info('py stdout:', dataStr);
		}
	});
	promiseSpawn.childProcess.stderr.on('data', function (data) {
		let dataStr = data.toString().replace(/^\s+|\s+$/g, '');
		if (dataStr) {
			logger.info('py stderr:', dataStr);
		}
	});
	let spawnFinished = false;
	return Promise.race([
		promiseSpawn.then(function (result) {
			spawnFinished = true;
			logger.info('image displayed after', getTimespan());
		}),
		timeout.then(function () {
			promiseSpawn.childProcess.kill();
			if (!spawnFinished) {
				logger.warn('image display timeout after', getTimespan());
			} else {
				logger.debug('timeout promise finished');
			}
		})
	]);
}

function getTimespan() {
	let duration = moment(moment().diff(startTime));
	return duration.minutes() + 'm' + duration.seconds() + '.' + duration.milliseconds() + 's ';
}

function shouldUpdateForecast() {
	let curDate = moment();
	if (!last_darksky_update) {
		return true;
	}

	for (let i = -1; i < forecast_update_times.length; i++) {
		let beforeDate = null;

		let afterDate = null;

		if (i < 0) {
			beforeDate = moment(forecast_update_times[forecast_update_times.length - 1], 'HH:mm:ss Z').subtract(1, 'd');
		} else {
			beforeDate = moment(forecast_update_times[i], 'HH:mm:ss Z');
		}

		if (i + 1 > forecast_update_times.length - 1) {
			//add one day 
			afterDate = moment(forecast_update_times[0], 'HH:mm:ss Z').add(1, 'd');
		} else {
			afterDate = moment(forecast_update_times[i + 1], 'HH:mm:ss Z');
		}

		logger.debug('index', i, 'between', beforeDate.format(), 'and', afterDate.format());

		if (curDate.isBetween(beforeDate, afterDate)) {
			if (!last_darksky_update.isBetween(beforeDate, afterDate)) {
				// we update if current time is between two dates, but not last updateDime				
				return true;
			}
		}
	}

	return false;
}

function isHumWarning(hum) {
	return hum < hum_min_warn || hum > hum_max_warn;
}

function isNoiseWarning(noise) {
	return noise > noise_max_warn;
}

function isCO2Warning(co2) {
	return co2 > co2_max_warn;
}

function addNoiseToTab(noise) {
	noise_values.push(noise);
	while (noise_values.length > noise_average_smoothing) {
		noise_values.shift();
	}
	logger.info('noise values', JSON.stringify(noise_values));

}

function commitNoiseValues() {
	noise_avg_prev = noise_avg_curr;
	noise_avg_curr = getNewNoiseAvg();
	logger.info('new noise average prev=', noise_avg_prev, 'curr=', noise_avg_curr);
}

function getNewNoiseAvg() {
	if (noise_values.length === noise_average_smoothing) {
		let sumNoise = 0;
		for (let i = 0; i < noise_average_smoothing; i++) {
			sumNoise += noise_values[i];
		}
		return sumNoise / noise_average_smoothing;
	}
	return 0;
}

function shouldUpdate(lastVal, newVal) {
	if (!lastVal || !newVal) {
		logger.warn('no previous data');
		return true;
	}

	let timespan = Math.abs(moment('' + lastVal.time, 'X').diff(moment('' + newVal.time, 'X')));

	if (timespan >= trigger_time_ms) {
		logger.info('no screen refresh for', trigger_time_ms, 'ms, refreshing now');
		return true;
	}

	//temp check
	if (shouldUpdateTemp(lastVal.main_room.temp, newVal.main_room.temp) ||
		shouldUpdateTemp(lastVal.room_1.temp, newVal.room_1.temp) ||
		shouldUpdateTemp(lastVal.room_2.temp, newVal.room_2.temp)) {
		return true;
	}

	//for external temp, we do not trigger update at night
	if (moment().hour() >= morning_hour && shouldUpdateTemp(lastVal.ext.temp, newVal.ext.temp)) {
		return true;
	}

	//CO2 check
	if (shouldUpdateCO2(lastVal.main_room.co2, newVal.main_room.co2) ||
		shouldUpdateCO2(lastVal.room_1.co2, newVal.room_1.co2) ||
		shouldUpdateCO2(lastVal.room_2.co2, newVal.room_2.co2)) {
		return true;
	}

	//hum check
	if (shouldUpdateHum(lastVal.main_room.hum, newVal.main_room.hum) ||
		shouldUpdateHum(lastVal.room_1.hum, newVal.room_1.hum) ||
		shouldUpdateHum(lastVal.room_2.hum, newVal.room_2.hum)) {
		return true;
	}

	//noise check
	if (shouldUpdateNoise(noise_avg_curr, getNewNoiseAvg())) {
		return true;
	}




	//no need to update
	return false;

}

function shouldUpdateTemp(lastVal, newVal) {
	if (Math.abs(lastVal - newVal) >= trigger_temp) {
		logger.info('Temp significant change : old', lastVal, 'new', newVal);
		return true;
	} else {
		return false;
	}
}

function shouldUpdateCO2(lastVal, newVal) {
	if (Math.abs(lastVal - newVal) >= trigger_co2 || isCO2Warning(lastVal) !== isCO2Warning(newVal)) {
		logger.info('CO2 significant change : old', lastVal, 'new', newVal);
		return true;
	} else {
		return false;
	}
}

function shouldUpdateHum(lastVal, newVal) {
	if (Math.abs(lastVal - newVal) >= trigger_hum || isHumWarning(lastVal) !== isHumWarning(newVal)) {
		logger.info('Hum significant change : old', lastVal, 'new', newVal);
		return true;
	} else {
		return false;
	}
}

function shouldUpdateNoise(lastVal, newVal) {
	if (isNoiseWarning(lastVal) !== isNoiseWarning(newVal)) {
		logger.info('Noise significant change : old', lastVal, 'new', newVal);
		return true;
	} else {
		return false;
	}
}

function getDataFromNetatmo() {
	let accessToken = '';
	let formData = Object.assign({ grant_type: 'password', scope: 'read_station read_thermostat write_thermostat' }, config.netatmo_auth);

	return request({
		method: 'POST',
		uri: 'https://api.netatmo.com/oauth2/token',
		form: formData
	}).then(function (data) {
		accessToken = JSON.parse(data).access_token;
		return request({
			method: 'POST',
			uri: 'https://api.netatmo.com/api/getstationsdata?access_token=' + accessToken
		});
	}).then(function (data) {
		let devices = JSON.parse(data).body.devices[0];
		let capt_ext = _.find(devices.modules, {
			_id: config.netatmo_config.weather.outside.id
		});
		let capt_room_1 = _.find(devices.modules, {
			_id: config.netatmo_config.weather.room_1.id
		});
		let capt_room_2 = _.find(devices.modules, {
			_id: config.netatmo_config.weather.room_2.id
		});

		let returnVal = {
			last_store_time: devices.last_status_store,
			time: devices.dashboard_data.time_utc,

		};
		if (capt_ext && capt_ext.dashboard_data) {
			returnVal.ext = {
				temp: capt_ext.dashboard_data.Temperature,
				hum: capt_ext.dashboard_data.Humidity,
				temp_min: capt_ext.dashboard_data.min_temp,
				temp_max: capt_ext.dashboard_data.max_temp,
				temp_trend: capt_ext.dashboard_data.temp_trend
			};
		}
		if (devices && devices.dashboard_data) {
			returnVal.main_room = {
				temp: devices.dashboard_data.Temperature,
				hum: devices.dashboard_data.Humidity,
				hum_warning: isHumWarning(devices.dashboard_data.Humidity),
				temp_min: devices.dashboard_data.min_temp,
				temp_max: devices.dashboard_data.max_temp,
				temp_trend: devices.dashboard_data.temp_trend,
				co2: devices.dashboard_data.CO2,
				co2_warning: isCO2Warning(devices.dashboard_data.CO2),
				noise: devices.dashboard_data.Noise,
				noise_warning: isNoiseWarning(noise_avg_curr)
			};

			if (config.netatmo_config.heating) {
				if (heating_off_trigger && returnVal.main_room.temp > config.netatmo_config.heating.upper_temp) {
					logger.info('[heating] turning off heating');
					setThermMode(accessToken, config.netatmo_config.heating.home_id, 'away');
				} else if (heating_on_trigger && returnVal.main_room.temp < config.netatmo_config.heating.lower_temp) {
					logger.info('[heating] turning on heating');
					setThermMode(accessToken, config.netatmo_config.heating.home_id, 'schedule');
				} else {
					logger.info('[heating] ' + returnVal.main_room.temp + ' is between ' + config.netatmo_config.heating.lower_temp + ' and ' + config.netatmo_config.heating.upper_temp + ': do nothing');
				}
			}


		}
		if (capt_room_1 && capt_room_1.dashboard_data) {
			returnVal.room_1 = {
				temp: capt_room_1.dashboard_data.Temperature,
				hum: capt_room_1.dashboard_data.Humidity,
				hum_warning: isHumWarning(capt_room_1.dashboard_data.Humidity),
				temp_min: capt_room_1.dashboard_data.min_temp,
				temp_max: capt_room_1.dashboard_data.max_temp,
				temp_trend: capt_room_1.dashboard_data.temp_trend,
				co2: capt_room_1.dashboard_data.CO2,
				co2_warning: isCO2Warning(capt_room_1.dashboard_data.CO2)
			};
		}
		if (capt_room_2 && capt_room_2.dashboard_data) {
			returnVal.room_2 = {
				temp: capt_room_2.dashboard_data.Temperature,
				hum: capt_room_2.dashboard_data.Humidity,
				hum_warning: isHumWarning(capt_room_2.dashboard_data.Humidity),
				temp_min: capt_room_2.dashboard_data.min_temp,
				temp_max: capt_room_2.dashboard_data.max_temp,
				temp_trend: capt_room_2.dashboard_data.temp_trend,
				co2: capt_room_2.dashboard_data.CO2,
				co2_warning: isCO2Warning(capt_room_2.dashboard_data.CO2)
			};
		}


		return returnVal;
	});

	function setThermMode(token, homeid, mode) {
		return request({
			method: 'POST',
			headers: {
				'accept': 'application/json',
				'Authorization': 'Bearer ' + token
			},
			uri: 'https://api.netatmo.com/api/setthermmode?home_id=' + homeid + '&mode=' + mode
		})
	}
}


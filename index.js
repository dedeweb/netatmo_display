const bmp_lib = require('bitmap-manipulation');
const path = require('path');
//const netatmo = require('netatmo');
const request = require('request-promise');
const _ = require('lodash');
const moment = require('moment');
const spawn = require('child-process-promise').spawn;
const winston = require('winston');
const fs = require('fs');
const PROD = !fs.existsSync(path.join(__dirname,'debug'));
const Gpio = require('onoff').Gpio;


const cmdTimeout = 70000;
const outputFile = path.join(__dirname,'out.bmp');

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

const morning_hour = 6; //trigger on ext. temp only after this hour. 

//forecast update times
const forecast_update_times = ['06:00:00', '18:30:00']

//led flash interval
const led_flash_interval = 1000;


var logger = new(winston.Logger)({
	transports: [
		new winston.transports.Console({
			level: 'debug',
			colorize: true,
			timestamp: function() {
				return moment().format('YYYY-MM-DD HH:mm:ss');
			},
			handleExceptions: true
		}),
		new winston.transports.File({
			level: 'info',
			colorize: false,
			timestamp: function() {
				return moment().format('YYYY-MM-DD HH:mm:ss');
			},
			json: false,
			filename: path.join(__dirname, 'logs', 'log.log'),
			handleExceptions: true,
			maxsize: 1000000,
			maxFiles: 5,
			tailable: true
		})
	]
});


var refreshing = false;
var previous_data = null;
var last_darksky_update = null;
var noise_values = [];
var noise_avg_prev = 0;
var noise_avg_curr = 0;
var led = {};
var res = {};

moment.locale('fr');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
addDrawTextRightFunction();

var startTime = moment();

logger.info('load fonts and bitmaps');

var bitmap = new bmp_lib.BMPBitmap(640, 384);
var palette = bitmap.palette;
var color = {
	white: palette.indexOf(0xffffff),
	black: palette.indexOf(0x000000),
	red: palette.indexOf(0xff0000)
};

loadRes();

logger.info('script launch after',  getTimespan());

//launch process
refresh(true);


function refresh(triggerNextUpdate) {
	if (refreshing && !triggerNextUpdate) {
		logger.warn('already refreshing, exit immediately');
		return;
	}
	logger.info('------------------------------------------------------');
	startTime = moment();
	goBusyGreen();
	let nextUpdateTimeoutSet = false;
	getDataFromNetatmo().then(function(data_netatmo) {
			if (data_netatmo) {
				logger.info('netatmo data received after', getTimespan());

				let lastStoreTimeSpanMs = moment().diff(moment('' + data_netatmo.last_store_time, 'X')),
					lastStoreTimeSpan = moment(lastStoreTimeSpanMs);

				logger.info('last store date was', lastStoreTimeSpan.minutes() + 'm' + lastStoreTimeSpan.seconds() + 's ago');

				addNoiseToTab(data_netatmo.salon.noise);
				
				if (triggerNextUpdate) {
					let shouldAbort = false;
					//netatmo refresh is every 10 minutes, we make it 11 to be sure
					let triggerSpan = 660000 - lastStoreTimeSpanMs;
					if(lastStoreTimeSpanMs < 0) {
						//should never happen :/
						logger.warn('wrong timespan !', lastStoreTimeSpanMs);
						triggerSpan = -1; //hack to refresh in 30s
					}
					if(triggerSpan < 0 && triggerSpan > - 300000) {
						// trigger span is negative (between 11 and 15 minutes ago), let's refresh in 30 sec, no need to go further  ! 
						logger.info('no update since between 11 and 15 minutes, retry in 30s !');
						triggerSpan = 30000;
						shouldAbort = true;
					} else if(triggerSpan < 0)  {
						logger.debug('timespan ms is ',lastStoreTimeSpanMs);
						logger.debug('triggerSpan is ',triggerSpan);
						logger.info('no news for more than 15 minutes, try again in 10 minutes');
						// no news for more than 15 minutes, there is probably a problem. Lets try again in in 10 minutes. No need to go further ! 
						triggerSpan = 600000;
						shouldAbort = true;
					} else if(triggerSpan < 300000) {
						logger.warn('trigger span is less than 5 min, setting it to 5 min. tiggerSpan =', triggerSpan);
						triggerSpan = 300000;
					}
					logger.info('set timeout in ' + triggerSpan + 'ms');
					setTimeout(function() {
						refresh(true);
					}, triggerSpan);
					nextUpdateTimeoutSet = true;
					if (shouldAbort) {
						throw 'abort';
					}
					if (refreshing) {
						throw 'already_refreshing';
					}
					if (!shouldUpdate(previous_data, data_netatmo)) {
						throw 'no_changes';
					}
					previous_data = data_netatmo;
					commitNoiseValues();
					
				} else {
					logger.warn('Manual update : do not set trigger');
				}
				refreshing = true;
				
				if (shouldUpdateForecast()) {
					logger.info('updating forecast...');
					return request({
						method: 'GET',
						uri: 'https://api.darksky.net/forecast/e15352093dc7d957ab4814250be41336/45.194444,%205.737515?lang=fr&units=ca'
					}).then(function(data_darksky) {
						logger.info('darksky data received after', getTimespan());
						last_darksky_update = moment();
						drawImage(data_netatmo, JSON.parse(data_darksky));
					}).catch(function(e) {
						logger.error('darksky server error ! ',e);
						drawImage(data_netatmo, null);
					});	
				} else {
					logger.info('no need to refresh forecast.');
					drawImage(data_netatmo, null);
				}
			} else {
				logger.error('no netatmo data :(');
			}
		}).then(function() {
			goBusyFlashing();
			return sendToScreen();
		})
		.catch(function(error) {
			if (error === 'already_refreshing') {
				logger.warn('already refreshing ! ');
			} else if (error === 'abort') {
				logger.warn('aborted ! ');
			} else if (error === 'no_changes') {
				logger.warn('no significant changes, no screen update. ');
			} else {
				logger.error('unexpected error', error);
			}
		})
		.finally(function() {
			logger.info('completed in', getTimespan());
			if(!nextUpdateTimeoutSet && triggerNextUpdate) {
				logger.warn('next update is not set, forcing it in 11m');
				setTimeout(function() {
					refresh(true);
				}, 660000);
			}
			refreshing = false;
			exitBusy();
		});
}

//--------------------------------------------------------------------------

function sendToScreen() {
	let timeout = new Promise((resolve, reject) => {
		let id = setTimeout(() => {
			resolve('command out in ' + cmdTimeout + 'ms.');
			clearTimeout(id);
		}, cmdTimeout);
	});
	logger.info('spawning python command');
	let promiseSpawn;
	if (PROD) {
		promiseSpawn = spawn('python', ['-u', path.join(__dirname, 'python/main.py'), outputFile]);
	} else {
		logger.warn('Debug mode, no real display ! ');
		promiseSpawn = spawn('sh', [ path.join(__dirname, 'fake_disp.sh')]);
	}
	
	promiseSpawn.childProcess.stdout.on('data', function(data) {
		let dataStr = data.toString().replace(/^\s+|\s+$/g, '');
		if (dataStr) {
			logger.info('py stdout:', dataStr);
		}
	});
	promiseSpawn.childProcess.stderr.on('data', function(data) {
		let dataStr = data.toString().replace(/^\s+|\s+$/g, '');
		if (dataStr) {
			logger.info('py stderr:', dataStr);
		}
	});
	let spawnFinished = false;
	return Promise.race([
		promiseSpawn.then(function(result) {
			spawnFinished = true;
			logger.info('image displayed after', getTimespan());
		}),
		timeout.then(function() {
			promiseSpawn.childProcess.kill();
			if(!spawnFinished) {
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

function drawImage(data_netatmo, data_darksky) {
	goBusy();
	
	
	if (!data_darksky && fs.existsSync(outputFile)) {
		logger.info('partial refresh : refresh only netatmo data. ')
		//start from previous bmp
		bitmap = bmp_lib.BMPBitmap.fromFile(outputFile);
		// and erase netatmo part, which will be freshed. 
		bitmap.drawFilledRect(0, 0, 640, 105, color.white, color.white);
		bitmap.drawFilledRect(160, 105, 480, 77, color.white, color.white);
	} else {
		//redraw all. 
		logger.info('full refresh');
		bitmap.clear(color.white);	
	}
	
	
	
	drawOutline();

	drawFirstCol(data_netatmo.ext.temp, data_netatmo.ext.temp_trend, data_netatmo.ext.temp_min, data_netatmo.ext.temp_max);
	drawCol(160,
		data_netatmo.salon.temp, data_netatmo.salon.hum, data_netatmo.salon.co2, data_netatmo.salon.temp_min, data_netatmo.salon.temp_max, data_netatmo.salon.noise);
	drawCol(320,
		data_netatmo.chambre.temp, data_netatmo.chambre.hum, data_netatmo.chambre.co2, data_netatmo.chambre.temp_min, data_netatmo.chambre.temp_max);
	drawCol(480,
		data_netatmo.bureau.temp, data_netatmo.bureau.hum, data_netatmo.bureau.co2, data_netatmo.bureau.temp_min, data_netatmo.bureau.temp_max);

	drawDate(data_netatmo.time);

	if (data_darksky) {
		bitmap.drawFilledRect(0, 183, 640, 20, color.black, color.black);
		bitmap.drawFilledRect(0, 203, 640, 1, color.red, null);
		drawEphemerides(data_darksky.daily.data[0].sunriseTime, data_darksky.daily.data[0].sunsetTime);
		let xInc = 6;
		for (let i = 0; i < 7; i++) {
			xInc += drawForecastDay(xInc, 183, data_darksky.daily.data[i]);
		}
	}
	
	bitmap.save(outputFile);
	logger.info('image rendered after', getTimespan());
}

function getDarkSkyIconFromCode(code) {
	switch (code) {
		case 'clear-day':
		case 'clear-night':
		case 'partly-cloudy-night':
			return 'clear';
		case 'rain':
			return 'rain';
		case 'snow':
		case 'sleet':
			return 'snow';
		case 'wind':
			return 'wind';
		case 'fog':
			return 'hazy';
		case 'cloudy':
			return 'cloudy';
		case 'partly-cloudy-day':
			return 'partlysunny';
		default:
			return 'unknown';
	}
}

function bearingToDir(bearing) {

	if (bearing >= 337.5 && bearing < 22.5)
		return 'N';
	if (bearing >= 22.5 && bearing < 67.5)
		return 'NE';
	if (bearing >= 67.5 && bearing < 112.5)
		return 'E';
	if (bearing >= 112.5 && bearing < 157.5)
		return 'SE';
	if (bearing >= 157.5 && bearing < 202.5)
		return 'S';
	if (bearing >= 202.5 && bearing < 247.5)
		return 'SW';
	if (bearing >= 247.5 && bearing < 292.5)
		return 'W';
	if (bearing >= 292.5 && bearing < 337.5)
		return 'NW';

	return 'N';
}

function shouldUpdateForecast() {
	let curDate =  moment();
	if(!last_darksky_update) {
		return true;
	}
	
	for(let i= -1; i<forecast_update_times.length; i++) {
		let beforeDate =  null;
		
		let afterDate = null;
		
		if (i<0) {
			beforeDate = moment(forecast_update_times[forecast_update_times.length-1], 'HH:mm:ss').subtract(1, 'd');
		} else {
			beforeDate = moment(forecast_update_times[i], 'HH:mm:ss');	
		}
		
		if(i +1 > forecast_update_times.length - 1) {
			//add one day 
			afterDate = moment(forecast_update_times[0], 'HH:mm:ss').add(1, 'd');
		} else {
			afterDate = moment(forecast_update_times[i+1], 'HH:mm:ss');	
		}
		
		logger.debug('index', i ,'between', beforeDate.format(), 'and', afterDate.format());
		
		if(curDate.isBetween(beforeDate, afterDate)) {
			if (!last_darksky_update.isBetween(beforeDate, afterDate)) {
				// we update if current time is between two dates, but not last updateDime				
				return true;
			}
		}		
	}
	
	return false;
}

function drawEphemerides(sunrise, sunset) {
	let sunriseTxt =  moment('' + sunrise, 'X').format('HH:mm');
	let sunsetTxt =  moment('' + sunset, 'X').format('HH:mm');

	bitmap.drawBitmap(res.icons.sunrise, 28, 123);
	bitmap.drawText(res.font.black_18, sunriseTxt,20, 150);
	bitmap.drawBitmap(res.icons.sunset, 108, 123);
	bitmap.drawText(res.font.black_18, sunsetTxt,100, 150);
}

function drawForecastDay(x, y, data) {
	let momentObj = moment('' + data.time, 'X');
	let day = momentObj.format('ddd DD').toUpperCase();
	let isSunday = momentObj.format('d') === '0';

	let colWidth = 90;

	if (isSunday) {
		bitmap.drawFilledRect(x + 94, y, 2, 20, color.white, color.white);
		drawDotLine( x + 91, y + 20, 200);
		bitmap.drawFilledRect(x + 93, y + 20, 3, 200, color.black, color.black);
		colWidth = 95;
	} else {
		bitmap.drawFilledRect(x + 89, y, 2, 20, color.white,color.white);
		drawDotLine(x + 89, y + 20, 200);
	}

	bitmap.drawBitmap(res.weather_icons[getDarkSkyIconFromCode(data.icon)], x + 12, y + 21);
	bitmap.drawText(res.font.white_18, day, x + 15, y + 2);

	bitmap.drawBitmap(res.icons.arrow_down_black, x + 4, y + 87);
	bitmap.drawText(res.font.black_18, '' + Math.round(data.temperatureLow) + ' °', x + 18, y + 85);

	bitmap.drawBitmap(res.icons.arrow_top_red, x + 47, y + 87);
	bitmap.drawText(res.font.red_18, '' + Math.round(data.temperatureHigh) + ' °', x + 61, y + 85);

	/*let wind_icon = bmp_lib.BMPBitmap.fromFile("glyph/wind.bmp");
	bitmap.drawBitmap(wind_icon,x+5,y+100);*/
	bitmap.drawBitmap(res.windir_icons[bearingToDir(data.windBearing)], x + 5, y + 110);
	bitmap.drawBitmap(res.icons.kph, x + 60, y + 110);
	//bitmap.drawText(fontBlack, data.avewind.dir, x+25, y+100);
	bitmap.drawTextRight(res.font.black_18, Math.round(data.windSpeed) + '-' + Math.round(data.windGust), x + 55, y + 110);

	bitmap.drawBitmap(res.icons.rain, x + 5, y + 135);
	bitmap.drawText(res.font.black_18, Math.round(data.precipProbability * 100) + '%', x + 25, y + 135);
	let rainVal = Math.round(data.precipIntensity * 24);
	if (rainVal > 0) {
		bitmap.drawText(res.font.black_18, rainVal + ' mm', x + 25, y + 158);
	}
	let snowVal = Math.round(data.precipAccumulation);
	if (snowVal > 0) {
		bitmap.drawBitmap(res.icons.snow, x + 4, y + 180);
		bitmap.drawText(res.font.black_18, '' + snowVal + ' cm', x + 25, y + 180);
	}

	return colWidth;
}

function drawDate(date) {
	let dateStr = 'mesuré le ' + moment('' + date, 'X').format('DD MMM à HH:mm');
	bitmap.drawTextRight(res.font.black_18, dateStr, 635, 165);
}

function drawOutline() {
	bitmap.drawFilledRect(0, 0, 159, 20, color.black, color.black);
	bitmap.drawFilledRect(161, 0, 158, 20, color.black, color.black);
	bitmap.drawFilledRect(321, 0, 158, 20, color.black, color.black);
	bitmap.drawFilledRect(481, 0, 159, 20, color.black, color.black);
	bitmap.drawFilledRect(0, 20, 640, 1, color.red, null);
	drawHorizDotLine(160, 65, 480);
	drawHorizDotLine(0, 105, 160);
	drawDotLine(159, 20, 163);
	drawDotLine(319, 20, 163);
	drawDotLine(479, 20, 140);

	bitmap.drawText(res.font.white_18, "EXTÉRIEUR", 15, 1);
	bitmap.drawText(res.font.white_18, "SÉJOUR", 175, 1);
	bitmap.drawText(res.font.white_18, "CHAMBRE", 335, 1);
	bitmap.drawText(res.font.white_18, "BUREAU", 495, 1);
}

function drawFirstCol(temp, temp_trend, temp_min, temp_max) {
	
	bitmap.drawTextRight(res.font.black_55, '' + temp, 115, 25);
	bitmap.drawBitmap(res.icons.deg,123, 35);
	
	let trendIcon = null;
	if (temp_trend === 'up') {
		trendIcon = res.icons.arrow_top_red;
	} else if (temp_trend === 'down') {
		trendIcon = res.icons.arrow_down_black
	} else if (temp_trend === 'stable') {
		trendIcon = res.icons.arrow_right_black;
	}
	
	bitmap.drawBitmap(trendIcon,125, 55);
	
	bitmap.drawBitmap(res.icons.arrow_down_black, 20, 82);
	bitmap.drawText(res.font.black_18, '' + temp_min + ' °', 35, 82);

	bitmap.drawBitmap(res.icons.arrow_top_red, 90, 86);
	bitmap.drawText(res.font.red_18, '' + temp_max + ' °', 105, 82);

}

function drawCol( x, temp, hum, co2, temp_min, temp_max, noise) {

	//temp
	bitmap.drawTextRight(res.font.black_36, '' + temp, x + 70, 25);
	bitmap.drawText(res.font.black_18, "°", x + 75, 27);

	//temp minmax
	bitmap.drawBitmap(res.icons.arrow_top_red, x + 95, 28);
	bitmap.drawText(res.font.red_18, '' + temp_max + ' °', x + 112, 26);
	bitmap.drawBitmap(res.icons.arrow_down_black, x + 95, 45);
	bitmap.drawText(res.font.black_18, '' + temp_min + ' °', x + 112, 43);


	//hum = 70;
	//hum
	if ( isHumWarning(hum)) {
		bitmap.drawFilledRect(x + 1, 66, 158, 43, null, color.red);
	}
	bitmap.drawTextRight(res.font.black_36, '' + hum, x + 90, 70);
	bitmap.drawText(res.font.black_18, "%", x + 95, 72);
	//co2 = 1200;
	//co2
	if (isCO2Warning(co2)) {
		bitmap.drawFilledRect(x + 1, 107, 158, 38, null, color.red);
	}
	bitmap.drawTextRight(res.font.black_36, '' + co2, x + 90, 108);
	bitmap.drawText(res.font.black_18, "ppm", x + 95, 110);

	//noise
	if (noise) {
		if (isNoiseWarning(noise_avg_curr)) {
			bitmap.drawFilledRect(x + 1, 143, 158, 40, null, color.red);
		}
		bitmap.drawTextRight(res.font.black_36, '' + noise, x + 90, 145);
		bitmap.drawText(res.font.black_18, "dB", x + 95, 147);
	}
}

function isHumWarning(hum) {
	return hum < hum_min_warn || hum  > hum_max_warn;
}

function isNoiseWarning(noise) {
	return noise > noise_max_warn;
}

function isCO2Warning(co2) {
	return co2 > co2_max_warn;
}

function addNoiseToTab(noise) {
	noise_values.push(noise);
	while(noise_values.length > noise_average_smoothing) {
		noise_values.shift();
	}
	logger.info('noise values', JSON.stringify(noise_values));
	
}

function commitNoiseValues() {
	noise_avg_prev = noise_avg_curr;
	noise_avg_curr = getNewNoiseAvg();
	logger.info('new noise average prev=',noise_avg_prev, 'curr=', noise_avg_curr);
}

function getNewNoiseAvg() {
	if(noise_values.length === noise_average_smoothing) {
		let sumNoise = 0;
		for(let i=0;i<noise_average_smoothing; i++) {
			sumNoise += noise_values[i];
		}
		return   sumNoise / noise_average_smoothing;
	}
	return 0;
}

function shouldUpdate(lastVal, newVal) {
	if(!lastVal || !newVal) {
		logger.warn('no previous data');
		return true;
	}
	
	let timespan = Math.abs(moment('' + lastVal.time, 'X').diff(moment('' + newVal.time, 'X')));

	if (timespan >= trigger_time_ms) {
		logger.info('no screen refresh for',trigger_time_ms,'ms, refreshing now');
		return true;
	}
	
	//temp check
	if (shouldUpdateTemp(lastVal.salon.temp, newVal.salon.temp) ||
		shouldUpdateTemp(lastVal.chambre.temp, newVal.chambre.temp) ||
		shouldUpdateTemp(lastVal.bureau.temp, newVal.bureau.temp)) {
		return true;
	}
	
	//for external temp, we do not trigger update at night
	if( moment().hour() >= morning_hour && shouldUpdateTemp(lastVal.ext.temp, newVal.ext.temp)) {
		return true;
	}
	
	//CO2 check
	if (shouldUpdateCO2(lastVal.salon.co2, newVal.salon.co2) || 
		shouldUpdateCO2(lastVal.chambre.co2, newVal.chambre.co2) ||
		shouldUpdateCO2(lastVal.bureau.co2, newVal.bureau.co2)) {
		return true;
	}
	
	//hum check
	if (shouldUpdateHum(lastVal.salon.hum, newVal.salon.hum) || 
		shouldUpdateHum(lastVal.chambre.hum, newVal.chambre.hum) ||
		shouldUpdateHum(lastVal.bureau.hum, newVal.bureau.hum)) {
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
	if (Math.abs(lastVal-newVal) >= trigger_co2 || isCO2Warning(lastVal) !== isCO2Warning(newVal)) {
		logger.info('CO2 significant change : old', lastVal, 'new', newVal);
		return true;
	} else {
		return false;
	}
}

function shouldUpdateHum(lastVal, newVal) {
	if (Math.abs(lastVal-newVal) >= trigger_hum || isHumWarning(lastVal) !== isHumWarning(newVal)) {
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

function drawDotLine(left, top, height) {
	var pixon = true;
	for (var x = left; x < left + 2; x++) {

		for (var y = top; y < top + height; y++) {
			if (pixon) {
				bitmap.setPixel(x, y, color.black);
			} else {
				bitmap.setPixel(x, y, color.white);
			}
			pixon = !pixon;
		}
		pixon = false;
	}
}

function drawHorizDotLine(left, top, width) {
	var pixon = true;

	for (var x = left; x < left + width; x++) {
		if (pixon) {
			bitmap.setPixel(x, top, color.black);
		} else {
			bitmap.setPixel(x, top, color.white);
		}
		pixon = !pixon;
	}
}

//led management. 


if(PROD) {
	led = {
		red: new Gpio(2, 'low'),
		green: new Gpio(3, 'low')
	}
}

var ledFlashIntervalId = 0;

function ledRedOn() {
	if(led.red) {
		led.red.writeSync(1);
	}
	ledGreenOff();
	logger.debug('[led] red ON');
}

function ledRedOff() {
	if(led.red) {
		led.red.writeSync(0);
	}
	logger.debug('[led] red OFF');
}

function ledGreenOn() {
	if(led.green) {
		led.green.writeSync(1);
	}
	ledRedOff();
	logger.debug('[led] green ON');
} 

function ledGreenOff()  {
	if(led.green) {
		led.green.writeSync(0);
	}
	logger.debug('[led] green OFF');
}

function goBusy() {
	if (ledFlashIntervalId) {
		clearInterval(ledFlashIntervalId);
	}
	ledRedOn();
}

function goBusyGreen() {
	if (ledFlashIntervalId) {
		clearInterval(ledFlashIntervalId);
	}
	ledGreenOn();
}

function goBusyFlashing() {
	if (ledFlashIntervalId) {
		clearInterval(ledFlashIntervalId);
	}
	logger.info('red led flashing');
	
	let lighton = true;
	ledFlashIntervalId = setInterval(function () {
		if(lighton) {
			ledRedOn();
		} else {
			ledRedOff();
		}
		lighton = !lighton; 
	}, led_flash_interval);
}

function exitBusy() {
	if (ledFlashIntervalId) {
		clearInterval(ledFlashIntervalId);
	}
	ledRedOff();
	ledGreenOff();
}



function getDataFromNetatmo() {
	let accessToken = '';
	return request({
		method: 'POST',
		uri: 'https://api.netatmo.com/oauth2/token',
		form: {
			client_id: "5a1590ee2d3e04e0fe8b4e68",
			client_secret: "61xilx6nGiX4LcE8JXeocsLhLV",
			username: "denis.messie+netatmoapp@gmail.com",
			password: "{S)[#X7NT/a'rrWG",
			grant_type: 'password'
		}
	}).then(function(data) {
		accessToken = JSON.parse(data).access_token;
		return request({
			method: 'POST',
			uri: 'https://api.netatmo.com/api/getstationsdata?access_token=' + accessToken
		});
	}).then(function(data) {
		let devices = JSON.parse(data).body.devices[0];
		let capt_ext = _.find(devices.modules, {
			_id: '02:00:00:13:42:00'
		});
		let capt_chambre = _.find(devices.modules, {
			_id: '03:00:00:03:94:9a'
		});
		let capt_bureau = _.find(devices.modules, {
			_id: '03:00:00:05:df:d2'
		});

		return {
			last_store_time: devices.last_status_store,
			time: devices.dashboard_data.time_utc,
			ext: {
				temp: capt_ext.dashboard_data.Temperature,
				hum: capt_ext.dashboard_data.Humidity,
				temp_min: capt_ext.dashboard_data.min_temp,
				temp_max: capt_ext.dashboard_data.max_temp,
				temp_trend: capt_ext.dashboard_data.temp_trend
			},
			salon: {
				temp: devices.dashboard_data.Temperature,
				hum: devices.dashboard_data.Humidity,
				temp_min: devices.dashboard_data.min_temp,
				temp_max: devices.dashboard_data.max_temp,
				temp_trend: devices.dashboard_data.temp_trend,
				co2: devices.dashboard_data.CO2,
				noise: devices.dashboard_data.Noise
			},
			chambre: {
				temp: capt_chambre.dashboard_data.Temperature,
				hum: capt_chambre.dashboard_data.Humidity,
				temp_min: capt_chambre.dashboard_data.min_temp,
				temp_max: capt_chambre.dashboard_data.max_temp,
				temp_trend: capt_chambre.dashboard_data.temp_trend,
				co2: capt_chambre.dashboard_data.CO2
			},
			bureau: {
				temp: capt_bureau.dashboard_data.Temperature,
				hum: capt_bureau.dashboard_data.Humidity,
				temp_min: capt_bureau.dashboard_data.min_temp,
				temp_max: capt_bureau.dashboard_data.max_temp,
				temp_trend: capt_bureau.dashboard_data.temp_trend,
				co2: capt_bureau.dashboard_data.CO2
			}
		}
	});
}

function addDrawTextRightFunction() {
	bmp_lib.BMPBitmap.prototype.drawTextRight = function(font, text, x, y) {
		let fontBitmap = font.getBitmap();
		let lineHeight = font.getLineHeight();
		let fontDetails = font.getDetails();
		let characterInfoMap = fontDetails.chars;
		let kernings = fontDetails.kernings;
		let transparentColor = font.getTransparentColor();
		let lines = text.split(/\r?\n|\r/);
		let lineX = x;
		for (let line of lines) {
			let lastCharacter = null;
			for (let i = line.length - 1; i >= 0; i--) {
				let character = line[i];
				let characterInfo = characterInfoMap[character];
				if (!characterInfo) {
					continue;
				}
				let kerning = kernings[character];
				if (kerning && lastCharacter) {
					kerning = kerning[lastCharacter];
					if (kerning) {
						x -= kerning.amount;
					}
				}
				this.drawBitmap(fontBitmap, x + characterInfo.xoffset - characterInfo.width, y + characterInfo.yoffset,
					transparentColor, characterInfo.x, characterInfo.y, characterInfo.width,
					characterInfo.height);
				x -= characterInfo.xadvance;
			}
			x = lineX;
			y += lineHeight;
		}
	};
	}

function loadRes() {
	res.font = {};
	
	res.font.white_18 = new bmp_lib.Font(path.join(__dirname, 'font/proxima.json'));
	res.font.white_18.setSize(18);
	res.font.white_18.setColor(color.white);

	res.font.black_18 = new bmp_lib.Font(path.join(__dirname, 'font/proxima.json'));
	res.font.black_18.setSize(18);
	res.font.black_18.setColor(color.black);

	res.font.red_18 = new bmp_lib.Font(path.join(__dirname, 'font/proxima.json'));
	res.font.red_18.setSize(18);
	res.font.red_18.setColor(color.red);

	res.font.black_55 = new bmp_lib.Font(path.join(__dirname, 'font/proxima.json'));
	res.font.black_55.setSize(55);
	res.font.black_55.setColor(color.black);

	res.font.black_36 = new bmp_lib.Font(path.join(__dirname, 'font/proxima.json'));
	res.font.black_36.setSize(36);
	res.font.black_36.setColor(color.black);
	
	res.icons = {};
	res.icons.arrow_down_black = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/arrow_down_black.bmp'));
	res.icons.arrow_top_red = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/arrow_top_red.bmp'));
	res.icons.arrow_right_black = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/arrow_right_black.bmp'));
	res.icons.rain = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/raindrop.bmp'));
	res.icons.kph = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/kph.bmp'));
	res.icons.snow = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/snow.bmp'));
	res.icons.sunrise = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/sunrise.bmp'));
	res.icons.sunset = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/sunset.bmp'));
	res.icons.deg = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/deg.bmp'));
	
	res.windir_icons = {};
	res.windir_icons.E = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/E.bmp'));
	res.windir_icons.N = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/N.bmp'));
	res.windir_icons.NE = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/NE.bmp'));
	res.windir_icons.NW = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/NW.bmp'));
	res.windir_icons.S = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/S.bmp'));
	res.windir_icons.SE = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/SE.bmp'));
	res.windir_icons.SW = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/SW.bmp'));
	res.windir_icons.W = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/winddir/W.bmp'));
	
	res.weather_icons = {};
	res.weather_icons.clear =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/clear.bmp'));
	res.weather_icons.rain =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/rain.bmp'));
	res.weather_icons.snow =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/snow.bmp'));
	res.weather_icons.wind =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/wind.bmp'));
	res.weather_icons.hazy =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/hazy.bmp'));
	res.weather_icons.cloudy =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/cloudy.bmp'));
	res.weather_icons.partlysunny =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/partlysunny.bmp'));
	res.weather_icons.unknown =  bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/unknown.bmp'));
	
}

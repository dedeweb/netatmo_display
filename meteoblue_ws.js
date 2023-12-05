module.exports = wsMeteoblue;

function wsMeteoblue(opt) {
	const cheerio = require('cheerio');
	const request = require('request-promise');
	const moment = require('moment');
	const fs = require('fs');
	const path = require('path');
	const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));


	//params
	let logger = opt.logger;

	// API/data for end-user
	return {
		getData: getData,

	}

	// private functions

	async function getData(previous_data) {
		let latLon = await getLatLong();
		$ = await getCheerioObj();
		let weatherObj = previous_data;
		if (!weatherObj) {
			logger.info('create weather obj');
			weatherObj = {
				sunset: latLon ? latLon.sunset : null, // data_darksky.daily.data[0].sunsetTime,
				sunrise: latLon ? latLon.sunrise : null,// data_darksky.daily.data[0].sunriseTime,
				days: []
			};

			for (let i = 0; i < 7; i++) {
				let dayObj = {
					time: moment().add(i, 'days').toISOString(),
					timestamp: null,
					icon: '',
					min_temp: 0,
					max_temp: 0,
					wind: 0,
					wind_dir: '',
					precip_prob: 0,
					rain_qty: 0,
					snow_qty: 0,
					predictability: 0
				};
				weatherObj.days.push(dayObj);
			}
		}

		// console.log(weatherObj);
		let beginDay = $('#tab_results #tab_wrapper>.tab').first().find('.tab_day_long').text().trim().toLowerCase();
		logger.debug('begin day is ' + beginDay);
		let shiftDays = 0;
		if (beginDay === 'demain') {
			logger.info('begin day is tommorrow');
			shiftDays = 1;
		}


		$('#tab_results #tab_wrapper>.tab').each(function (i, elt) {
			//let day_data = {};
			//day_data.name = $(this).find('.day .tab_day_short').text().trim();
			let index = i + shiftDays;

			if (index < weatherObj.days.length) {

				let max_temp = $(this).find('.temps .tab-temp-max').text().replace('°C', '').trim();
				logger.debug('update max_temp', weatherObj.days[index].max_temp, '->', max_temp);
				weatherObj.days[index].max_temp = max_temp;

				let min_temp = $(this).find('.temps .tab-temp-min').text().replace('°C', '').trim();
				logger.debug('update min_temp', weatherObj.days[index].min_temp, '->', min_temp);
				weatherObj.days[index].min_temp = min_temp;

				let wind = $(this).find('.data .wind').text().replace('km/h', '').trim();
				logger.debug('update wind', weatherObj.days[index].wind, '->', wind);
				weatherObj.days[index].wind = wind;

				let wind_css_class = $(this).find('.data .wind .glyph').attr('class');
				let regex_windir = /.*(N|E|S|W|NE|NW|SE|SW)$/gm.exec(wind_css_class);
				if (regex_windir) {
					let wind_dir = regex_windir[1];
					logger.debug('update wind_dir', weatherObj.days[index].wind_dir, '->', wind_dir);
					weatherObj.days[index].wind_dir = wind_dir;
				} else {
					logger.warn('invalid win dir. Css class', wind_css_class);
				}

				let tab_rain = $(this).find('.data .tab-precip').text().replace('mm', '').replace('cm', '').trim().split('-');
				weatherObj.days[index].rain_min = 0;
				weatherObj.days[index].rain_max = 0;
				if (tab_rain.length > 0) {
					weatherObj.days[index].rain_min = tab_rain[0];
				}
				if (tab_rain.length > 1) {
					weatherObj.days[index].rain_max = tab_rain[1];
					weatherObj.days[index].rain_qty = tab_rain[1];
					weatherObj.days[index].precip_prob = 1;
				}

				weatherObj.days[index].sun = $(this).find('.data .tab-sun').text().replace('h', '').trim();

				let predicTotal = $(this).find('.tab-predictability .predictability').length;
				let predic = $(this).find('.tab-predictability .high-predictability').length;
				weatherObj.days[index].predictability = predic / predicTotal;

				// let predicElt = /.*class-(\d)/gm.exec(predicClass);

				// if (predicElt && predicElt.length > 0) {
				// 	let predic = predicElt[1];
				// 	weatherObj.days[index].predictability = parseFloat(predic) / 5.0;
				// 	logger.debug('predictability', weatherObj.days[index].predictability);
				// } else {
				// 	logger.warn('cannot parse predictability ! ');
				// 	logger.verbose('predic class : ' + predicClass);
				// 	logger.verbose($(this).html());
				// }

				try {
					let pic_src = $(this).find('.weather .day .weather-pictogram').attr('src'); //like  https://static.meteoblue.com/website/images/picto/06_iday.svg

					let iconNber = parseInt(/.*static\.meteoblue\.com\/assets\/images\/picto\/(\d*)_iday\.svg/gm.exec(pic_src)[1]);
					let icon = nberToIco(parseInt(iconNber));
					logger.debug('update icon', weatherObj.days[index].icon, '->', icon);
					weatherObj.days[index].icon = icon;
				}
				catch (e) {
					logger.error('cannot parse weather icon ' + (e.message || e));
					// process.emit('uncaughtException', e);

					weatherObj.days[index].icon = 'unknown';
				}
			}
		});


		computeRainQty($, shiftDays, weatherObj.days[0 + shiftDays]); //today

		// console.log(weatherObj);

		return weatherObj;

	}

	function computeRainQty($, shiftDays, day) {
		if (day.rain_qty) {
			day.rain_hourly = [];
			$('.precip-bar-part .precip-hourly').each(function () {
				// let precipBar = $(this).find('.precip-bar');
				let predic = 0;
				//if(precipBar.length) {
				predic = parseInt(/.*class-(\d)/gm.exec($(this).attr('class'))[1]);
				//}
				day.rain_hourly.push(predic);
			});
			if (day.rain_hourly.length > 21) {
				day.rain_hourly = day.rain_hourly.slice(0, 21);
			}
			logger.debug('rain = ' + JSON.stringify(day.rain_hourly));
		}
	}


	function getCheerioObj() {
		logger.info(`loading ${config.weather.mb_url}...`);
		return request(config.weather.mb_url)
			.then(function (html) {
				return cheerio.load(html);
			});


	}

	async function getLatLong() {
		try {
			let resp = JSON.parse(await request({
				method: 'GET',
				uri: `https://api.sunrise-sunset.org/json?lat=${config.weather.lat}&lng=${config.weather.lon}&formatted=0`
			}));
			// console.log(resp);
			return resp.results;
		}
		catch (e) {
			return null;
		}

	}

	function nberToIco(nber) {
		// https://content.meteoblue.com/en/help/standards/symbols-and-pictograms
		switch (nber) {
			case 1:
				return 'clear';
			case 2:
				return 'mostly_sunny';
			case 3:
				return 'partly_cloudy';
			case 4:
				return 'cloudy';
			case 5:
				return 'hazy';
			case 6:
				return 'rain';
			case 7:
			case 14:
			case 16:
				return 'rain_sun';
			case 8:
				return 'tstorm';
			case 10:
			case 15:
			case 17:
				return 'snow_sun';
			case 11:
				return 'rain_snow';
			case 13:
				return 'light_snow';
			case 9:
				return 'snow';
			case 12:
				return 'light_rain';
			case 20:
				return 'mostly_cloudy';
			case 22:
				return 'tstorm_chance';
			default:
				logger.warn('unknown code ', nber);
				return 'unknown';
		}
	}
}

module.exports = wsMeteoblue;

function wsMeteoblue(opt) {
	const cheerio = require('cheerio');
	const moment = require('moment');
	const request = require('request-promise');

	//params
	let logger = opt.logger;

	// API/data for end-user
	return {
		getData: getData,

	}

	// private functions

	function getData() {
		return getCheerioObj().then(function($) {
			let data = [];
			$('#tab_results #tab_wrapper>.tab').each(function(i, elt) {
				let day_data = {};
				day_data.name = $(this).find('.day .tab_day_short').text().trim();
				day_data.max_temp = $(this).find('.temps .tab_temp_max').text().replace('°C', '').trim();
				day_data.min_temp = $(this).find('.temps .tab_temp_min').text().replace('°C', '').trim();
				day_data.wind = $(this).find('.data .wind').text().replace('km/h', '').trim();
				let tab_rain = $(this).find('.data .tab_precip').text().replace('mm', '').replace('cm', '').trim().split('-');
				day_data.rain_min = 0;
				day_data.rain_max = 0;
				if (tab_rain.length > 0) {
					day_data.rain_min = tab_rain[0];
				}
				if (tab_rain.length > 1) {
					day_data.rain_max = tab_rain[1];
				}

				day_data.sun = $(this).find('.data .tab_sun').text().replace('h', '').trim();
				day_data.predictability = /.*class-(\d)/gm.exec($(this).find('.tab_predictability .meter_inner.predictability').attr('class'))[1];
				let iconNber = parseInt(/.*p(\d*)_iday/gm.exec($(this).find('.weather .pictoicon .picon').attr('class'))[1]);

				day_data.icon = nberToIco(iconNber);
				data.push(day_data);
			});
			logger.debug('data meteoblue', JSON.stringify(data));
			return data;
		});
	}

	function getCheerioObj() {

		return request('https://www.meteoblue.com/fr_FR/weather/forecast/week/grenoble_fr_31635')
			.then(function(html) {
				return cheerio.load(html);
			});


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
			case 11:
				return 'rain_sun';
			case 8:
				return 'tstorm';
			case 9:
			case 10:
			case 13:
			case 15:
			case 17:
				return 'snow';
			case 12:
				return 'lightrain';
			default:
				logger.warn('unknown code ', nber);
				return 'unknown';
		}
	}
}
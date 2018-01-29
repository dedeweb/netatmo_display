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

	function getData(previous_data) {
		return getCheerioObj().then(function($) {
			let weatherObj = previous_data;
			if (!weatherObj) {
				weatherObj = {
					sunset: data_darksky.daily.data[0].sunsetTime,
					sunrise: data_darksky.daily.data[0].sunriseTime,
					days: []
				};

				for (let i = 0; i < 7; i++) {
					let dayObj = {
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
			$('#tab_results #tab_wrapper>.tab').each(function(i, elt) {
				//let day_data = {};
				//day_data.name = $(this).find('.day .tab_day_short').text().trim();
				
				
				let max_temp =  $(this).find('.temps .tab_temp_max').text().replace('°C', '').trim();
				logger.debug('update max_temp',weatherObj.days[i].max_temp, '->',  max_temp);
				weatherObj.days[i].max_temp = max_temp;
				
				let min_temp = $(this).find('.temps .tab_temp_min').text().replace('°C', '').trim();
				logger.debug('update min_temp',weatherObj.days[i].min_temp, '->',  min_temp);
				weatherObj.days[i].min_temp = min_temp;
				
				let wind = $(this).find('.data .wind').text().replace('km/h', '').trim();
				logger.debug('update wind',weatherObj.days[i].wind, '->',  wind);
				weatherObj.days[i].wind = wind;
				
				let wind_css_class = $(this).find('.data .wind .glyph').attr('class');
				let regex_windir = /.*(N|E|S|W|NE|NW|SE|SW)$/gm.exec(wind_css_class);
				if (regex_windir) {
					let wind_dir = regex_windir[1]; 
					logger.debug('update wind_dir',weatherObj.days[i].wind_dir, '->',  wind_dir);
					weatherObj.days[i].wind_dir = wind_dir;	
				} else {
					logger.warn('invalid win dir. Css class', wind_css_class);
				}
				
				/*let tab_rain = $(this).find('.data .tab_precip').text().replace('mm', '').replace('cm', '').trim().split('-');
				day_data.rain_min = 0;
				day_data.rain_max = 0;
				if (tab_rain.length > 0) {
					day_data.rain_min = tab_rain[0];
				}
				if (tab_rain.length > 1) {
					day_data.rain_max = tab_rain[1];
				}*/

				//day_data.sun = $(this).find('.data .tab_sun').text().replace('h', '').trim();
				weatherObj.days[i].predictability = /.*class-(\d)/gm.exec($(this).find('.tab_predictability .meter_inner.predictability').attr('class'))[1];
				
				let iconNber = parseInt(/.*p(\d*)_iday/gm.exec($(this).find('.weather .pictoicon .picon').attr('class'))[1]);
				let icon = nberToIco(iconNber);
				logger.debug('update icon',weatherObj.days[i].icon, '->',  icon);
				weatherObj.days[i].icon = icon;
			});
			return weatherObj;
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
				return 'light_rain';
			default:
				logger.warn('unknown code ', nber);
				return 'unknown';
		}
	}
}
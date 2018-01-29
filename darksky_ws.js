module.exports = wsDarksky;

function wsDarksky(opt) {
  const request = require('request-promise');

  //params
  let logger = opt.logger;

  // API/data for end-user
  return {
    getData: getData,

  }

  // private functions

  function getData() {
    return request({
      method: 'GET',
      uri: 'https://api.darksky.net/forecast/e15352093dc7d957ab4814250be41336/45.194444,%205.737515?lang=fr&units=ca'
    }).then(function(data) {
      return transformData(JSON.parse(data));
    });
  }

  function transformData(data_darksky) {
    let weatherObj = {
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
      let dsData = data_darksky.daily.data[i];
      if (dsData) {
        dayObj.time = dsData.time;
        dayObj.icon = getDarkSkyIconFromCode(dsData.icon);
        dayObj.min_temp = Math.round(dsData.temperatureLow);
        dayObj.max_temp = Math.round(dsData.temperatureHigh);
        dayObj.wind = Math.round(dsData.windGust);
        dayObj.wind_dir = bearingToDir(dsData.windBearing);
        dayObj.precip_prob = dsData.precipProbability;
        dayObj.rain_qty = Math.round(dsData.precipIntensity * 24);
        dayObj.snow_qty = Math.round(dsData.precipAccumulation);
      }
      weatherObj.days.push(dayObj);
    }

    return weatherObj;
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
        return 'partly_cloudy';
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




}
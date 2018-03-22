module.exports = imageGenerator;

function imageGenerator(opt) {
  // options
  let logger = opt.logger;
  let outputFile = opt.outputFile;
  let getTimespan = opt.getTimespan;

  const path = require('path');
  const bmp_lib = require('bitmap-manipulation');
  const moment = require('moment');
  moment.locale('fr');
  const fs = require('fs');
  
  addDrawTextRightFunction();
  const led = require(path.join(__dirname, 'led'))({
    logger: logger
  });


  let bitmap = new bmp_lib.BMPBitmap(640, 384);
  let palette = bitmap.palette;
  let color = {
    white: palette.indexOf(0xffffff),
    black: palette.indexOf(0x000000),
    red: palette.indexOf(0xff0000)
  };
  let res = {};
  loadRes();


  // API/data for end-user
  return {
    drawImage: drawImage,
  }



  // private functions
  function drawImage(data_netatmo, data_forecast) {
    led.goBusy();


    if (!data_forecast && fs.existsSync(outputFile)) {
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
      data_netatmo.salon.temp,
      data_netatmo.salon.hum,
      data_netatmo.salon.hum_warning,
      data_netatmo.salon.co2,
      data_netatmo.salon.co2_warning,
      data_netatmo.salon.temp_min,
      data_netatmo.salon.temp_max,
      data_netatmo.salon.noise,
      data_netatmo.salon.noise_warning);
    drawCol(320,
      data_netatmo.chambre.temp,
      data_netatmo.chambre.hum,
      data_netatmo.chambre.hum_warning,
      data_netatmo.chambre.co2,
      data_netatmo.chambre.co2_warning,
      data_netatmo.chambre.temp_min,
      data_netatmo.chambre.temp_max);
    drawCol(480,
      data_netatmo.bureau.temp,
      data_netatmo.bureau.hum,
      data_netatmo.bureau.hum_warning,
      data_netatmo.bureau.co2,
      data_netatmo.bureau.co2_warning,
      data_netatmo.bureau.temp_min,
      data_netatmo.bureau.temp_max);

    drawDate(data_netatmo.time);

    if (data_forecast) {
      bitmap.drawFilledRect(0, 183, 640, 20, color.black, color.black);
      // bitmap.drawFilledRect(0, 203, 640, 1, color.red, null);
      drawEphemerides(data_forecast.sunrise, data_forecast.sunset);
      let xInc = 0;
      for (let i = 0; i < 7; i++) {
        xInc += drawForecastDay(xInc, 183, data_forecast.days[i]);
      }
    }

    bitmap.save(outputFile);
    logger.info('image rendered after', getTimespan());
  }

  function drawEphemerides(sunrise, sunset) {
    let sunriseTxt = moment('' + sunrise, 'X').format('HH:mm');
    let sunsetTxt = moment('' + sunset, 'X').format('HH:mm');

    bitmap.drawBitmap(res.icons.sunrise, 28, 123);
    bitmap.drawText(res.font.black_18, sunriseTxt, 20, 150);
    bitmap.drawBitmap(res.icons.sunset, 108, 123);
    bitmap.drawText(res.font.black_18, sunsetTxt, 100, 150);
  }

  function drawForecastDay(x, y, data) {
    let momentObj = moment('' + data.time, 'X');
    let day = momentObj.format('ddd DD').toUpperCase();
    let isSunday = momentObj.format('d') === '0';

    let colWidth = 91;

    if (isSunday) {
      bitmap.drawFilledRect(x + 94, y, 2, 21, color.white, color.white);
      drawDotLine(x + 92, y + 20, 200);
      drawDotLine(x + 94, y + 20, 200);
      //drawDotLine(x + 95, y + 21, 200);
      //bitmap.drawFilledRect(x + 93, y + 21, 3, 200, color.black, color.black);
      colWidth = 95;
    } else {
      bitmap.drawFilledRect(x + 90, y, 2, 21, color.white, color.white);
      drawDotLine(x + 90, y + 20, 200);
    }

    bitmap.drawBitmap(res.weather_icons[data.icon], x + 12, y + 23);
    bitmap.drawText(res.font.white_18, day, x + 15, y + 2);

    bitmap.drawBitmap(res.icons.arrow_down_black, x + 6, y + 87);
    bitmap.drawText(res.font.black_18, '' + data.min_temp + '°', x + 21, y + 87);

    bitmap.drawBitmap(res.icons.arrow_top_red, x + 48, y + 92);
    bitmap.drawText(res.font.red_18, '' + data.max_temp + '°', x + 62, y + 87);

    /*let wind_icon = bmp_lib.BMPBitmap.fromFile("glyph/wind.bmp");
    bitmap.drawBitmap(wind_icon,x+5,y+100);*/
    bitmap.drawBitmap(res.windir_icons[data.wind_dir], x + 5, y + 110);
    bitmap.drawTextRight(res.font.black_18, '' + data.wind, x + 40, y + 110);
    bitmap.drawBitmap(res.icons.kph, x + 45, y + 110);
    //bitmap.drawText(fontBlack, data.avewind.dir, x+25, y+100);
    

    
    
    if (data.precip_prob > 0 && (data.rain_qty > 0 || data.snow_qty > 0 ) ) {
      let horizLineWidth = isSunday? 91 : 89;
      drawHorizDotLine(x+1,  y + 130, horizLineWidth);
      
      drawPercentBar(data.precip_prob, x + 25,  y + 138, 55, 5, data.precip_prob >= 0.8);

      if (data.snow_qty > 0) {
        bitmap.drawBitmap(res.icons.snow, x + 5, y + 141);
        bitmap.drawTextRight(res.font.black_18, data.snow_qty + '' , x + 40,y + 147);
        bitmap.drawBitmap(res.icons.cm, x + 45, y + 147);
      }  else if (data.rain_qty > 0) {
        bitmap.drawBitmap(res.icons.rain, x + 5,  y + 142 );
        bitmap.drawTextRight(res.font.black_18, data.rain_qty + '' , x + 40,  y + 147);
        bitmap.drawBitmap(res.icons.mm, x + 45,y + 147);
      }
      
      drawHorizDotLine(x+1,  y + 165, horizLineWidth);
    }
    
    if(data.predictability) {
       bitmap.drawBitmap(res.icons.predic, x + 5,  y + 175);
       drawPercentBar(data.predictability, x + 25,  y + 175, 55, 15, data.predictability < 0.5);
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
    // bitmap.drawFilledRect(0, 20, 640, 1, color.red, null);
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
    bitmap.drawBitmap(res.icons.deg, 123, 35);

    let trendIcon = null;
    if (temp_trend === 'up') {
      trendIcon = res.icons.arrow_top_red;
    } else if (temp_trend === 'down') {
      trendIcon = res.icons.arrow_down_black
    } else if (temp_trend === 'stable') {
      trendIcon = res.icons.arrow_right_black;
    }
    
    if (trendIcon) {
      bitmap.drawBitmap(trendIcon, 125, 55);  
    }
    

    bitmap.drawBitmap(res.icons.arrow_down_black, 20, 82);
    bitmap.drawText(res.font.black_18, '' + temp_min + ' °', 35, 82);

    bitmap.drawBitmap(res.icons.arrow_top_red, 90, 87);
    bitmap.drawText(res.font.red_18, '' + temp_max + ' °', 105, 82);

  }

  function drawCol(x, temp, hum, hum_warning, co2, co2_warning, temp_min, temp_max, noise, noise_warning) {

    //temp
    bitmap.drawTextRight(res.font.black_36, '' + temp, x + 70, 25);
    bitmap.drawText(res.font.black_18, "°", x + 75, 27);

    //temp minmax
    bitmap.drawBitmap(res.icons.arrow_top_red, x + 95, 31);
    bitmap.drawText(res.font.red_18, '' + temp_max + ' °', x + 112, 26);
    bitmap.drawBitmap(res.icons.arrow_down_black, x + 95, 43);
    bitmap.drawText(res.font.black_18, '' + temp_min + ' °', x + 112, 43);


    //hum = 70;
    //hum
    if (hum_warning) {
      //bitmap.drawFilledRect(x + 1, 66, 158, 40, null, color.red);
      drawRoundedBox(x + 2, 67, 156, 37, color.red);
      //bitmap.drawFilledRect(x + 2, 67, 156, 38, color.red, color.white);
      //bitmap.drawFilledRect(x + 3, 68, 154, 36, color.red, color.white);
      bitmap.drawTextRight(res.font.red_36, '' + hum, x + 90, 68);
      bitmap.drawText(res.font.red_18, "%", x + 95, 71);
      // bitmap.drawFilledRect(x + 1, 66, 158, 43, null, color.red);
    } else {
      bitmap.drawTextRight(res.font.black_36, '' + hum, x + 90, 68);
      bitmap.drawText(res.font.black_18, "%", x + 95, 71);  
    }
    
    //co2 = 1200;
    //co2
    if (co2_warning) {
      drawRoundedBox(x + 2, 106, 156, 37, color.red);
      //bitmap.drawFilledRect(x + 2, 107, 156, 36, color.red, color.white);
      //bitmap.drawFilledRect(x + 3, 108, 154, 34, color.red, color.white);
      // bitmap.drawFilledRect(x + 1, 107, 158, 38, null, color.red);
      bitmap.drawTextRight(res.font.red_36, '' + co2, x + 90, 107);
      bitmap.drawText(res.font.red_18, "ppm", x + 95, 109);

    } else {
      bitmap.drawTextRight(res.font.black_36, '' + co2, x + 90, 107);
      bitmap.drawText(res.font.black_18, "ppm", x + 95, 109);  
    }
    
    //noise
    if (noise) {
      if (noise_warning) {
        drawRoundedBox(x+2, 145, 156, 37, color.red);
        //bitmap.drawFilledRect(x+2, 145, 156,37, color.red, color.white);
        //bitmap.drawFilledRect(x+3, 146, 154,35, color.red, color.white);
        //bitmap.drawFilledRect(x + 1, 143, 158, 40, null, color.red);
        bitmap.drawTextRight(res.font.red_36, '' + noise, x + 90, 146);
        bitmap.drawText(res.font.red_18, "dB", x + 95, 149);
      } else {
        bitmap.drawTextRight(res.font.black_36, '' + noise, x + 90, 146);
        bitmap.drawText(res.font.black_18, "dB", x + 95, 149);  
      }
      
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
  
  function drawRoundedBox(left, top, width, height, fillcolor) {
    bitmap.drawFilledRect(left, top, width, height, fillcolor, color.white);
    bitmap.drawFilledRect(left +1, top + 1, width -2, height -2, fillcolor, color.white);
    
    //top left corner
    bitmap.drawFilledRect(left , top , 4, 1, null, color.white);
    bitmap.drawFilledRect(left , top , 1, 4, null, color.white);
    bitmap.setPixel(left + 1 , top + 1 , color.white);
    bitmap.drawFilledRect(left + 2 , top + 2 , 3, 1, null, fillcolor);
    bitmap.drawFilledRect(left +2 , top +2, 1, 3, null, fillcolor);
    
    //top right corner
    bitmap.drawFilledRect(left + width - 4, top , 4, 1, null, color.white);
    bitmap.drawFilledRect(left + width - 1, top , 1, 4, null, color.white);
    bitmap.setPixel(left + width - 2 , top + 1 , color.white);
    bitmap.drawFilledRect(left + width - 5 , top + 2 , 3, 1, null, fillcolor);
    bitmap.drawFilledRect(left + width - 3 , top + 2, 1, 3, null, fillcolor);
    
    //down left corner
    bitmap.drawFilledRect(left , top + height - 1 , 4, 1, null, color.white);
    bitmap.drawFilledRect(left , top + height - 4, 1, 4, null, color.white);
    bitmap.setPixel(left + 1 , top + height - 2 , color.white);
    bitmap.drawFilledRect(left + 2 ,top + height - 3 , 3, 1, null, fillcolor);
    bitmap.drawFilledRect(left + 2 , top + height - 5, 1, 3, null, fillcolor);
    
    //down right corner
    bitmap.drawFilledRect(left + width - 4 , top + height - 1 , 4, 1, null, color.white);
    bitmap.drawFilledRect(left + width - 1 , top + height - 4, 1, 4, null, color.white);
    bitmap.setPixel(left + width - 2 , top + height - 2 , color.white);
    bitmap.drawFilledRect(left + width - 5, top + height - 3 , 3, 1, null, fillcolor);
    bitmap.drawFilledRect(left + width - 3, top + height - 5, 1, 3, null, fillcolor);
    
    //bitmap.setPixel(left + width - 1, top + height - 1, color.white);
  }
  
  /*
  function drawDotBox(left, top, width, height, fillcolor) {
    var pixon = true;
    var firstpixon = true;
    
    for (var x=left; x < left + width; x++) {
      pixon = firstpixon;
      for (var y=top; y < top + height; y++) {
        if(pixon) {
          bitmap.setPixel(x,y, fillcolor);
        } else {
          bitmap.setPixel(x,y, color.white);
        }
        pixon = !pixon;
      }
      firstpixon = !firstpixon;
    }
    
  }
  */
  function drawPercentBar(percent, left, top, width, height, is_red) {
    bitmap.drawFilledRect(left + 1, top, width - 2, 1, color.black, color.black);
    bitmap.drawFilledRect(left + 1, top + height - 1 , width - 2, 1, color.black, color.black);
    
    bitmap.drawFilledRect(left, top +1 , 1, height - 2, color.black, color.black);
    bitmap.drawFilledRect(left + width -1, top +1, 1, height - 2, color.black, color.black);
    
    let inside_color = color.black;
    if(is_red) {
      inside_color = color.red;
    }
    
    for (let i = 1; i < height - 1; i++) {
      bitmap.drawFilledRect(left +1, top + i, parseFloat(width-2) * percent , 1, inside_color, inside_color);
    }
  }
  
  function loadRes() {
    logger.info('loading bitmaps and fonts');
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
    
    res.font.red_36 = new bmp_lib.Font(path.join(__dirname, 'font/proxima.json'));
    res.font.red_36.setSize(36);
    res.font.red_36.setColor(color.red);

    res.icons = {};
    res.icons.arrow_down_black = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/arrow_down_black.bmp'));
    res.icons.arrow_top_red = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/arrow_top_red.bmp'));
    res.icons.arrow_right_black = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/arrow_right_black.bmp'));
    res.icons.rain = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/raindrop.bmp'));
    res.icons.kph = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/kph.bmp'));
    res.icons.mm = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/mm.bmp'));
    res.icons.cm = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/cm.bmp'));
    res.icons.snow = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/snow.bmp'));
    res.icons.sunrise = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/sunrise.bmp'));
    res.icons.sunset = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/sunset.bmp'));
    res.icons.deg = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/deg.bmp'));
    res.icons.predic = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/predic.bmp'));

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
    res.weather_icons.clear = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/clear.bmp'));
    res.weather_icons.rain = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/rain.bmp'));
    res.weather_icons.snow = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/snow.bmp'));
    res.weather_icons.wind = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/wind.bmp'));
    res.weather_icons.hazy = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/hazy.bmp'));
    res.weather_icons.cloudy = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/cloudy.bmp'));
    res.weather_icons.partly_cloudy = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/partlysunny.bmp'));
    res.weather_icons.mostly_sunny = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/mostly_sunny.bmp'));
    res.weather_icons.rain_sun = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/rain_sun.bmp'));
    res.weather_icons.rain_snow = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/rain_snow.bmp'));
    res.weather_icons.snow_sun = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/snow_sun.bmp'));
    res.weather_icons.light_snow = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/light_snow.bmp'));
    res.weather_icons.light_rain = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/light_rain.bmp'));
    res.weather_icons.tstorm = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/tstorm.bmp'));
    res.weather_icons.unknown = bmp_lib.BMPBitmap.fromFile(path.join(__dirname, 'glyph/weather/unknown.bmp'));
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


}
const bmp_lib = require('bitmap-manipulation');
const path = require('path');
//const netatmo = require('netatmo');
const request = require('request-promise');
const _ = require('lodash');
const moment = require('moment');
moment.locale('fr');
const Wunderground = require('wunderground-api');
let wundergroundClient = new Wunderground('16d0f3d6b33e6130', 'Grenoble', 'FRANCE');

//https://peter.build/weather-underground-icons/

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
        for (let i = line.length -1; i >= 0; i--) {
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
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


getDataFromNetatmo().then(function(data_netatmo) {
    if(data_netatmo) {
        console.log('netatmo data received');
        wundergroundClient.forecast10day('', function (err, data_wunderground) {
            //console.log(JSON.stringify(data));
            if(err) {
                console.error(err);
            } else  if(data_wunderground) {
                console.log('wunderground data received');
                drawImage(data_netatmo, data_wunderground);
            }

        });
    } else {
        console.error('no netatmo data :(');
    }
});




//--------------------------------------------------------------------------



function drawImage(data_netatmo,data_wunderground) {
    let bitmap = new bmp_lib.BMPBitmap(640,384);
    let palette = bitmap.palette;
    bitmap.clear(palette.indexOf(0xffffff));
    drawOutline(bitmap, palette);

    drawFirstCol(bitmap, palette,
        data_netatmo.ext.temp,data_netatmo.ext.hum, data_netatmo.ext.temp_min, data_netatmo.ext.temp_max);
    drawCol(bitmap, palette, 160,
        data_netatmo.salon.temp, data_netatmo.salon.hum, data_netatmo.salon.co2, data_netatmo.salon.temp_min, data_netatmo.salon.temp_max, data_netatmo.salon.noise);
    drawCol(bitmap, palette, 320,
        data_netatmo.chambre.temp, data_netatmo.chambre.hum, data_netatmo.chambre.co2, data_netatmo.chambre.temp_min, data_netatmo.chambre.temp_max);
    drawCol(bitmap, palette, 480,
        data_netatmo.bureau.temp, data_netatmo.bureau.hum, data_netatmo.bureau.co2, data_netatmo.bureau.temp_min, data_netatmo.bureau.temp_max);

    drawDate(bitmap, palette, data_netatmo.time);


    bitmap.drawFilledRect(0,183,640,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(0,203,640,1, palette.indexOf(0xff0000), null);

    for(let i=0;i<7;i++) {
        drawForecastDay(bitmap, palette, 12 + i * 90, 183, data_wunderground.simpleforecast.forecastday[i]);
    }

    //drawForecastDay(bitmap, palette, x, y, data)

    bitmap.save('out.bmp');

}
function drawForecastDay(bitmap, palette, x, y, data) {
    let day =  moment('' + data.date.epoch, 'X').format('ddd DD').toUpperCase();
    let fontHeader =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    fontHeader.setSize(18);
    fontHeader.setColor(palette.indexOf(0xffffff));
    let fontBlack = new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    fontBlack.setSize(18);
    fontBlack.setColor(palette.indexOf(0x000000));
    let fontRed = new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    fontRed.setSize(18);
    fontRed.setColor(palette.indexOf(0xff0000));

    bitmap.drawFilledRect(x+89,y,2,20, palette.indexOf(0xffffff),  palette.indexOf(0xffffff));
    drawDotLine(bitmap, palette, x+89, y + 20,200);

    bitmap.drawText(fontHeader,day,x + 15 ,y + 2);

    let icon_weather = bmp_lib.BMPBitmap.fromFile('glyph/weather/' + data.icon+ '.bmp');
    bitmap.drawBitmap(icon_weather,x+12, y + 21);

    let arrow_down_black = bmp_lib.BMPBitmap.fromFile("glyph/array_down_black.bmp");
    bitmap.drawBitmap(arrow_down_black,x+4,y+82);
    bitmap.drawText(fontBlack, '' + data.low.celsius + ' °', x+18, y+80);

    let arrow_top_red = bmp_lib.BMPBitmap.fromFile("glyph/array_top_red.bmp");
    bitmap.drawBitmap(arrow_top_red,x+47,y+82);
    bitmap.drawText(fontRed, '' + data.high.celsius + ' °', x+61, y+80);

    let wind_icon = bmp_lib.BMPBitmap.fromFile("glyph/wind.bmp");
    bitmap.drawBitmap(wind_icon,x+4,y+100);
    bitmap.drawText(fontBlack, data.avewind.dir, x+25, y+100);
    bitmap.drawText(fontBlack, data.avewind.kph + '-' + data.maxwind.kph + ' km/h', x+10, y+120);

    let rain_icon = bmp_lib.BMPBitmap.fromFile("glyph/raindrop.bmp");
    bitmap.drawBitmap(rain_icon,x + 1,y+140);
    bitmap.drawText(fontBlack, data.pop + '%', x+20, y+140);
    let rainVal = Math.round(data.qpf_allday.mm);
    if( rainVal > 0 ) {
        bitmap.drawText(fontBlack, rainVal + 'mm', x+20, y+160);
    }
    let snowVal = Math.round(data.snow_allday.cm);
    if(snowVal > 0 ) {
        let snow_icon = bmp_lib.BMPBitmap.fromFile("glyph/snow.bmp");
        bitmap.drawBitmap(snow_icon,x + 4,y+180);
        bitmap.drawText(fontBlack,'' + snowVal + ' çm', x+28, y+180);
        //hack since letter 'c' does not seems to work :'(
        bitmap.drawFilledRect(x+28, y + 194,50,3, palette.indexOf(0xffffffff),  palette.indexOf(0xffffffff) );
    }


}
function drawDate(bitmap, palette, date) {
    //moment.locale('fr');
    /*moment.locale('fr', {
        monthsShort : 'janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.'.split('_'),
        weekdays : 'dimanche_lundi_mardi_mercredi_jeudi_vendredi_samedi'.split('_'),});*/
    let dateStr = 'mesuré le ' +  moment('' + date, 'X').format('DD MMM à HH:mm');
    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0x000000));
    bitmap.drawTextRight(font, dateStr,635 , 165);
}
function drawOutline(bitmap, palette) {
    bitmap.drawFilledRect(0,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(161,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(321,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(481,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(0,20  ,640,1, palette.indexOf(0xff0000), null);
    drawHorizDotLine(bitmap, palette, 160,65, 480);
    drawHorizDotLine(bitmap, palette, 0,105, 160);
    //bitmap.drawFilledRect(160, 65, 480, 1, palette.indexOf(0xff0000), null);
    drawDotLine(bitmap, palette, 159, 20,183);
    drawDotLine(bitmap, palette, 319, 20,183);
    drawDotLine(bitmap, palette, 479, 20,140);


    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0xffffff));
    bitmap.drawText(font, "EXTÉRIEUR",15 , 1);
    bitmap.drawText(font, "SÉJOUR",175 , 1);
    bitmap.drawText(font, "CHAMBRE",335 , 1);
    bitmap.drawText(font, "BUREAU",495 , 1);
}

function drawFirstCol(bitmap, palette, temp, hum, temp_min, temp_max ) {
    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(55);
    font.setColor(palette.indexOf(0x000000));
    bitmap.drawTextRight(font, '' + temp, 120, 25);
    bitmap.drawTextRight(font, '' + hum, 100, 115);

    font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0x000000));

    bitmap.drawText(font, "°", 125, 30);
    bitmap.drawText(font, "%", 105, 120);


    let array_down_black = bmp_lib.BMPBitmap.fromFile("glyph/array_down_black.bmp");
    bitmap.drawBitmap(array_down_black, 20, 82);
    bitmap.drawText(font, '' + temp_min + ' °',35, 82);

    let array_top_red = bmp_lib.BMPBitmap.fromFile("glyph/array_top_red.bmp");
    bitmap.drawBitmap(array_top_red,90, 86);
    font.setColor(palette.indexOf(0xff0000));
    bitmap.drawText(font, '' + temp_max + ' °', 105, 82);

}

function drawCol(bitmap, palette, x, temp, hum, co2, temp_min, temp_max, noise) {
    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(36);
    font.setColor(palette.indexOf(0x000000));
    let fontSmall =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    fontSmall.setSize(18);
    fontSmall.setColor(palette.indexOf(0x000000));
    let fontSmallRed =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    fontSmallRed.setSize(18);
    fontSmallRed.setColor(palette.indexOf(0xff0000));


    //temp
    bitmap.drawTextRight(font, '' + temp, x + 70, 25);
    bitmap.drawText(fontSmall, "°", x + 75, 27);

    //temp minmax
    let array_top_red = bmp_lib.BMPBitmap.fromFile("glyph/array_top_red.bmp");
    bitmap.drawBitmap(array_top_red, x + 95,28);
    bitmap.drawText(fontSmallRed, '' + temp_max + ' °',  x + 112, 26);
    let array_down_black = bmp_lib.BMPBitmap.fromFile("glyph/array_down_black.bmp");
    bitmap.drawBitmap(array_down_black,x + 95,45);
    bitmap.drawText(fontSmall, '' + temp_min + ' °', x + 112, 43);


    //hum = 70;
    //hum
    if(hum < 45 || hum > 65) {
        bitmap.drawFilledRect(x + 1,67  ,158,43, null , palette.indexOf(0xff0000));
    }
    bitmap.drawTextRight(font, '' + hum, x + 90, 70);
    bitmap.drawText(fontSmall, "%", x + 95, 72);
    //co2 = 1200;
    //co2
    if (co2 > 1000) {
        bitmap.drawFilledRect(x + 1,108  ,158,38, null , palette.indexOf(0xff0000));
    }
    bitmap.drawTextRight(font, '' + co2, x + 90, 108);
    bitmap.drawText(fontSmall, "ppm", x + 95, 110);

    //noise
    if(noise) {
        if(noise > 70) {
            bitmap.drawFilledRect(x + 1,143  ,158,40, null , palette.indexOf(0xff0000));
        }
        bitmap.drawTextRight(font, '' + noise, x + 90, 145);
        bitmap.drawText(fontSmall, "dB", x + 95, 147);
    }
}

function drawDotLine(bitmap, palette, left,top, height) {
    var pixon = true;
    for(var x=left; x<left+2; x++) {

        for(var y=top; y<top+height; y++) {
            if(pixon) {
                bitmap.setPixel(x,y,palette.indexOf(0x000000));
            } else {
                bitmap.setPixel(x,y,palette.indexOf(0xffffff));
            }
            pixon = !pixon;
        }
        pixon=false;
    }
}

function drawHorizDotLine(bitmap, palette, left,top, width) {
    var pixon = true;

    for(var x=left; x<left+width; x++) {
        if(pixon) {
            bitmap.setPixel(x,top,palette.indexOf(0x000000));
        } else {
            bitmap.setPixel(x,top,palette.indexOf(0xffffff));
        }
        pixon = !pixon;
    }
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
            method : 'POST',
            uri: 'https://api.netatmo.com/api/getstationsdata?access_token=' + accessToken
        });
    }).then(function(data) {
        let devices = JSON.parse(data).body.devices[0];
        let capt_ext = _.find(devices.modules, {_id: '02:00:00:13:42:00'});
        let capt_chambre = _.find(devices.modules, {_id: '03:00:00:03:94:9a'});
        let capt_bureau = _.find(devices.modules, {_id: '03:00:00:05:df:d2'});
        return {
            time: devices.last_status_store,
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





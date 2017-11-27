const bmp_lib = require('bitmap-manipulation');
const path = require('path');


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


let bitmap = new bmp_lib.BMPBitmap(640,384);
let palette = bitmap.palette;
bitmap.clear(palette.indexOf(0xffffff));

bitmap.drawFilledRect(0,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(161,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(321,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(481,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(0,20  ,640,1, palette.indexOf(0xff0000), null);
drawDotLine(bitmap,159, 20,364);
drawDotLine(bitmap,319, 20,364);
drawDotLine(bitmap,479, 20,364);
//bitmap.drawFilledRect(159, 20, 2, 364, palette.indexOf(0x000000), null);
//bitmap.drawFilledRect(319, 20, 2, 364, palette.indexOf(0x000000), null);
//bitmap.drawFilledRect(479, 20, 2, 364, palette.indexOf(0x000000), null);
//bitmap.drawFilledRect(0,20,640,2, palette.indexOf(0xff0000), null);


let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));

font.setSize(18);
font.setColor(palette.indexOf(0xffffff));
bitmap.drawText(font, "EXTÉRIEUR",15 , 1);
bitmap.drawText(font, "SÉJOUR",175 , 1);
bitmap.drawText(font, "CHAMBRE",335 , 1);
bitmap.drawText(font, "BUREAU",495 , 1);

font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
font.setSize(50);
font.setColor(palette.indexOf(0x000000));
bitmap.drawTextRight(font, "AAA123456", 110, 25);
bitmap.drawTextRight(font, "67", 110, 65);

font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
font.setSize(36);
font.setColor(palette.indexOf(0x000000));
bitmap.drawTextRight(font, "21.3", 250, 25);
bitmap.drawTextRight(font, "53", 250, 65);
bitmap.drawFilledRect(161,105  ,158,40, null , palette.indexOf(0xff0000));
bitmap.drawTextRight(font, "1200", 250, 105);
bitmap.drawTextRight(font, "61", 250, 145);

//bitmap.drawTextRight(font, "18.9", 335, 25);
//bitmap.drawTextRight(font, "5", 335, 65);
//bitmap.drawTextRight(font, "1200", 335, 105);

font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
font.setSize(18);
font.setColor(palette.indexOf(0x000000));

bitmap.drawText(font, "°", 115, 25);
bitmap.drawText(font, "%", 115, 65);

bitmap.drawText(font, "°", 255, 25);
bitmap.drawText(font, "%", 255, 65);
bitmap.drawText(font, "ppm", 255, 105);
bitmap.drawText(font, "dB", 255, 145);

//bitmap.drawText(font, "Hello World!", 1, 25);



function drawDotLine(bitmap,  left,top, height) {
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


bitmap.save('out.bmp');
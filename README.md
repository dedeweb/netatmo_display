#netatmo image generation for display on e-ink screen

forecast data come from darksky and meteoblue. Data forecast is for Grenoble, France. You have to modify darksky_ws.js and meteoblue_ws.js to get forecast for your location

this script is meant to be used on raspberry pi with waveshare e-ink display : https://www.waveshare.com/wiki/7.5inch_e-Paper_HAT_(B)


You must create a auth.json file on project root with this data : 
```json
{
  "netatmo" : {
    "client_id": "your client id",
    "client_secret": "your client secret",
    "username": "your netatmo user email",
    "password": "your netatmo password"
  },
  "darksky" : {
    "secret" : "your darksky secret"
  }
}
```

for testing purpose, you can run this script on any computer by creating a file named "debug" on project root. If this file exists, image is generated but not displayed to e-ink display. 

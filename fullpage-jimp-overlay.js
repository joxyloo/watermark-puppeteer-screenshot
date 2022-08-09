require('dotenv').config();

const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const puppeteer = require('puppeteer');
const { Bannerbear } = require('bannerbear');
const Jimp = require('jimp');

const bb = new Bannerbear(process.env.BB_API_KEY);
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
});

const WEBSITE_URL = 'https://www.bannerbear.com/help/';
const SCREENSHOT_NAME = 'screenshot-jimp.jpg';
const BUCKET_NAME = 'puppeteerscreenshot';
const BB_TEMPLATE_UID = 'Kp21rAZjGGW256eLnd';
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

(async () => {

  //Step 1. Capture a full-page screenshot using Puppeteer and get the watermark PNG from Bannerbear
  const dateTime = new Date().toLocaleString('en-US', { timeZone: 'UTC' });

  var [image, watermarkOverlay] = await Promise.all([captureScreenshot(WEBSITE_URL, SCREENSHOT_NAME), generateWatermarkOverlay(dateTime)]);

  // image.write('./images/fullpage-screenshot.jpg');
  // image.write('./images/watermark.png')

  //Step 2. Overlay the watermark on top of the screenshot
  const count = image.bitmap.height / VIEWPORT_HEIGHT;
  console.log(`loop for ${count} times...`);
  var heightOffset = 0;
  for (var i = 0; i < count; i++) {
    console.log(`count = ${i + 1}`);
    image.composite(watermarkOverlay, 0, heightOffset, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 1,
      opacityDest: 1,
    });
    heightOffset += VIEWPORT_HEIGHT;
  }

  // image.write('./images/fullpage-screenshot-jimp-example.jpg');

  //Step 3. Save the final image
  image.getBuffer(Jimp.MIME_JPEG, async (err, buffer) => {
    const res = await saveImageToBucket('watermarked', SCREENSHOT_NAME, buffer);
    const finalImgUrl = res.Location;
    console.log(finalImgUrl);
  });

})();

async function generateWatermarkOverlay(dateTime) {
  var modifications = [];

  for (var i = 1; i <= 4; i++) {
    modifications.push({
      name: `date_${i}`,
      text: dateTime,
    });
  }

  const images = await bb.create_image(
    BB_TEMPLATE_UID,
    {
      modifications: modifications,
      transparent: true,
    },
    true
  );

  return await Jimp.read(images.image_url_png);
}

async function captureScreenshot(website_url, screenshotName) {
  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });

  await page.goto(website_url, { waitUntil: 'networkidle0' });

  const screenshot = await page.screenshot({ path: screenshotName, fullPage: true });

  await browser.close();

  return await Jimp.read(screenshot);
}

async function saveImageToBucket(folderName, fileName, screenshot) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: `${folderName}/${fileName}`,
    Body: screenshot,
  };

  return await s3.upload(params).promise();
}

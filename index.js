require('dotenv').config();

const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const puppeteer = require('puppeteer');
const { Bannerbear } = require('bannerbear');

const bb = new Bannerbear(process.env.BB_API_KEY);
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
});

const WEBSITE_URL = 'https://www.bannerbear.com';
const SCREENSHOT_NAME = 'screenshot.jpg';
const BUCKET_NAME = 'puppeteerscreenshot';
const BB_TEMPLATE_UID = 'wvgMNmDoa10QZyARK0';
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

(async () => {
  //Step #1. Capture a Simple Screenshot Using Puppeteer
  const screenshotBuffer = await captureScreenshot(WEBSITE_URL, SCREENSHOT_NAME);

  //Step #2. Save the Screenshot to AWS S3
  const res = await saveImageToBucket(`original`, SCREENSHOT_NAME, screenshotBuffer);
  const imgUrl = res.Location;

  //Step #3. Add a Watermark Using Bannerbear
  var watermarkedUrl = await addWatermark(imgUrl);

  //Step #4. Save the Final Image
  const buffer = await getBufferFromUrl(watermarkedUrl);
  const res2 = await saveImageToBucket('watermarked', SCREENSHOT_NAME, buffer);
  const finalImgUrl = res2.Location;

  console.log(finalImgUrl);
})();

async function getBufferFromUrl(imgUrl) {
  const response = await fetch(imgUrl);
  return await response.buffer();
}

async function addWatermark(imgUrl) {
  var modifications = [
    {
      name: 'image',
      image_url: imgeUrl,
    },
  ];

  for (var i = 1; i <= 4; i++) {
    modifications.push({
      name: `date_${i}`,
      text: new Date().toLocaleString('en-US', { timeZone: 'UTC' }),
    });
  }

  const images = await bb.create_image(
    BB_TEMPLATE_UID,
    {
      modifications: modifications,
    },
    true
  );

  return images.image_url_jpg;
}

async function captureScreenshot(website_url, screenshotName) {
  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });

  await page.goto(website_url, { waitUntil: 'networkidle0' });

  const screenshot = await page.screenshot({ path: screenshotName });

  await browser.close();

  return screenshot;
}

async function saveImageToBucket(folderName, fileName, screenshot) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: `${folderName}/${fileName}`,
    Body: screenshot,
  };

  return await s3.upload(params).promise();
}

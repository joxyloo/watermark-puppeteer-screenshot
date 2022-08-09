require('dotenv').config();

const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const puppeteer = require('puppeteer');
const { Bannerbear } = require('bannerbear');
const Jimp = require('jimp');
const { imageToChunks } = require('split-images');
const mergeImg = require('merge-img');

const bb = new Bannerbear(process.env.BB_API_KEY);
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
});

const WEBSITE_URL = 'https://www.bannerbear.com';
const SCREENSHOT_NAME = 'screenshot.jpg';
const BUCKET_NAME = 'puppeteerscreenshot';
const BB_TEMPLATE_UID = 'Rqg32K5Qx1lNZ8V07Y';
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

(async () => {

  //Step 1. Capture a Full-page Screenshot Using Puppeteer
  const screenshotBuffer = await captureScreenshot(WEBSITE_URL, SCREENSHOT_NAME);

  //Step 2. Split the Image into Chunks and Save to AWS S3
  var imgUrlArr = await splitImage(screenshotBuffer);

  //Step 3. Add Dynamic Watermarks Using Bannerbear
  const bufferArr = [];
  const dateTime = new Date().toLocaleString('en-US', { timeZone: 'UTC' });

  for (var i = 0; i < imgUrlArr.length - 1; i++) { // omit the last image
    
    var watermarkedUrl = await addWatermark(imgUrlArr[i], dateTime);
    const buffer = await getBufferFromUrl(watermarkedUrl);

    bufferArr.push(buffer);
  }

  const lastImageBuffer = await getBufferFromUrl(imgUrlArr.pop()); 
  
  //add the last image to buffer array
  bufferArr.push(lastImageBuffer);

  //Step 4. Merge the Watermarked Image Chunks Into a Single Image
  const finalImg = await mergeImg(bufferArr, { direction: true });

//   finalImg.write('./images/fullpage-screenshot-example.jpg');

  //Step 5. Save the Final Image
  finalImg.getBuffer(Jimp.MIME_JPEG, async (err, buffer) => {
    const res = await saveImageToBucket('watermarked', SCREENSHOT_NAME, buffer);
    const finalImgUrl = res.Location;
    console.log(finalImgUrl);
  });
})();

async function splitImage(image) {
  var urlArr = [];
  const chunckSize = VIEWPORT_HEIGHT; 
  const chuncks = await imageToChunks(image, chunckSize);

  let i = 0;

  for (const c of chuncks) {
    i++;
    const fileName = `chunk_${i}.jpg`;
    const res = await saveImageToBucket(`original/${SCREENSHOT_NAME}`, fileName, c);
    const imgUrl = res.Location;
    urlArr.push(imgUrl);
  }

  return urlArr;
}

async function getBufferFromUrl(imgUrl) {
  const response = await fetch(imgUrl);
  return await response.buffer();
}

async function addWatermark(imgUrl, dateTime) {
  var modifications = [
    {
      name: 'image',
      image_url: imgUrl,
    },
  ];

  for (var i = 1; i <= 4; i++) {
    modifications.push({
      name: `date_${i}`,
      text: dateTime
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

  const screenshot = await page.screenshot({ path: screenshotName, fullPage: true });

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

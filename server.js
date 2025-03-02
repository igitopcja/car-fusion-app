const express = require('express');
const axios = require('axios');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const app = express();
const port = 3000;

require('dotenv').config();

const upload = multer({ dest: 'uploads/' });

// Serve static files, including uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/fuse', upload.fields([{ name: 'car1' }, { name: 'car2' }]), async (req, res) => {
  const car1Path = req.files['car1'][0].path;
  const car2Path = req.files['car2'][0].path;
  const car1Name = req.files['car1'][0].originalname.split('.')[0] || 'car1';
  const car2Name = req.files['car2'][0].originalname.split('.')[0] || 'car2';

  let car1ProcessedPath, car2ProcessedPath, outputBasePath, outputMaskPath;
  try {
    // Process car1
    console.log('Processing car1...');
    const car1Metadata = await sharp(car1Path).metadata();
    let car1Width = car1Metadata.width;
    let car1Height = car1Metadata.height;
    if (car1Width > 1024 || car1Height > 1024) {
      const scale = Math.min(1024 / car1Width, 1024 / car1Height);
      car1Width = Math.round(car1Width * scale);
      car1Height = Math.round(car1Height * scale);
    } else if (car1Width < 256 || car1Height < 256) {
      const scale = Math.max(256 / car1Width, 256 / car1Height);
      car1Width = Math.round(car1Width * scale);
      car1Height = Math.round(car1Height * scale);
    }
    const car1Buffer = await sharp(car1Path)
      .resize(car1Width, car1Height)
      .toFormat('png', { quality: 80, compressionLevel: 9 })
      .toBuffer();
    car1ProcessedPath = path.join(__dirname, 'uploads', `${car1Name}_processed.png`);
    await fs.writeFile(car1ProcessedPath, car1Buffer);
    const car1Stats = await fs.stat(car1ProcessedPath);
    console.log(`Car1 processed size: ${car1Stats.size} bytes`);
    if (car1Stats.size > 4 * 1024 * 1024) throw new Error('Car1 exceeds 4MB');
    const car1Meta = await sharp(car1ProcessedPath).metadata();
    console.log(`Car1 validated: ${car1Meta.format}, ${car1Meta.width}x${car1Meta.height}`);

    // Process car2
    console.log('Processing car2...');
    const car2Metadata = await sharp(car2Path).metadata();
    let car2Width = car2Metadata.width;
    let car2Height = car2Metadata.height;
    if (car2Width > 1024 || car2Height > 1024) {
      const scale = Math.min(1024 / car2Width, 1024 / car2Height);
      car2Width = Math.round(car2Width * scale);
      car2Height = Math.round(car2Height * scale);
    } else if (car2Width < 256 || car2Height < 256) {
      const scale = Math.max(256 / car2Width, 256 / car2Height);
      car2Width = Math.round(car2Width * scale);
      car2Height = Math.round(car2Height * scale);
    }
    const car2Buffer = await sharp(car2Path)
      .resize(car2Width, car2Height)
      .toFormat('png', { quality: 80, compressionLevel: 9 })
      .toBuffer();
    car2ProcessedPath = path.join(__dirname, 'uploads', `${car2Name}_processed.png`);
    await fs.writeFile(car2ProcessedPath, car2Buffer);
    const car2Stats = await fs.stat(car2ProcessedPath);
    console.log(`Car2 processed size: ${car2Stats.size} bytes`);
    if (car2Stats.size > 4 * 1024 * 1024) throw new Error('Car2 exceeds 4MB');
    const car2Meta = await sharp(car2ProcessedPath).metadata();
    console.log(`Car2 validated: ${car2Meta.format}, ${car2Meta.width}x${car2Meta.height}`);

    // Create composite base image
    console.log('Creating base image...');
    const car1Image = await fs.readFile(car1ProcessedPath);
    const car2Image = await fs.readFile(car2ProcessedPath);
    const car1MetaCheck = await sharp(car1Image).metadata();
    const car2MetaCheck = await sharp(car2Image).metadata();
    outputBasePath = path.join(__dirname, 'uploads', 'base.png');
    const baseWidth = 1024;
    const baseHeight = 1024;
    baseBuffer = await sharp({
      create: {
        width: baseWidth,
        height: baseHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        { input: car1Image, top: Math.round((baseHeight - car1MetaCheck.height) / 2), left: 
Math.round((baseWidth - car1MetaCheck.width) / 2) },
        { input: car2Image, top: Math.round((baseHeight - car2MetaCheck.height) / 2), left: 
Math.round((baseWidth - car2MetaCheck.width) / 2) }
      ])
      .toFormat('png', { quality: 80, compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
    await fs.writeFile(outputBasePath, baseBuffer);
    const outputStats = await fs.stat(outputBasePath);
    console.log(`Base image size: ${outputStats.size} bytes`);
    if (outputStats.size > 4 * 1024 * 1024) throw new Error('Base image exceeds 4MB');
    const baseMeta = await sharp(outputBasePath).metadata();
    console.log(`Base image revalidated: ${baseMeta.format}, ${baseMeta.width}x${baseMeta.height}`);

    // Create empty mask
    outputMaskPath = path.join(__dirname, 'uploads', 'mask.png');
    await fs.writeFile(outputMaskPath, Buffer.alloc(baseWidth * baseHeight * 4, 0));
  } catch (error) {
    console.error('Preprocessing error:', error.message);
    await fs.unlink(car1Path).catch(() => {});
    await fs.unlink(car2Path).catch(() => {});
    await fs.unlink(car1ProcessedPath).catch(() => {});
    await fs.unlink(car2ProcessedPath).catch(() => {});
    await fs.unlink(outputBasePath).catch(() => {});
    await fs.unlink(outputMaskPath).catch(() => {});
    return res.status(400).send(`Preprocessing failed: ${error.message}`);
  }

  try {
    // Prompt for fusion
    const prompt = `A single, photorealistic hybrid car seamlessly fused from unique parts of a 
${car1Name} and a ${car2Name}, shown from a perfect side profile with the entire car (front bumper to rear 
bumper) fully visible, perfectly centered with generous space on all sides on a 1024x1024 white 
background, with vibrant colors, detailed styling, and a natural, unified design, ensuring no cropping.`;

    // Send to OpenAI
    console.log('Sending request to OpenAI...');
    const formData = new FormData();
    const baseImageBuffer = await fs.readFile(outputBasePath);
    formData.append('image', baseImageBuffer, {
      contentType: 'image/png',
      filename: 'base.png'
    });
    const maskBuffer = await fs.readFile(outputMaskPath);
    formData.append('mask', maskBuffer, {
      contentType: 'image/png',
      filename: 'mask.png'
    });
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('size', '1024x1024');

    const response = await axios.post(
      'https://api.openai.com/v1/images/edits',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000 // 30-second timeout
      }
    );

    const fusedImage = response.data.data[0].url;

    // Cleanup
    await fs.unlink(car1Path).catch(() => {});
    await fs.unlink(car2Path).catch(() => {});
    await fs.unlink(car1ProcessedPath).catch(() => {});
    await fs.unlink(car2ProcessedPath).catch(() => {});
    await fs.unlink(outputBasePath).catch(() => {});
    await fs.unlink(outputMaskPath).catch(() => {});

    res.json({
      image: fusedImage,
      description: `Generated fusion of ${car1Name} and ${car2Name} into a single hybrid car, fully 
visible and centered`
    });
  } catch (error) {
    console.error('Fusion error details:', error.response ? error.response.data : error.message);
    await fs.unlink(car1Path).catch(() => {});
    await fs.unlink(car2Path).catch(() => {});
    await fs.unlink(car1ProcessedPath).catch(() => {});
    await fs.unlink(car2ProcessedPath).catch(() => {});
    await fs.unlink(outputBasePath).catch(() => {});
    await fs.unlink(outputMaskPath).catch(() => {});
    res.status(500).send(`Fusion failed: ${error.response ? error.response.data.message : 
error.message}`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));

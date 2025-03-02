const express = require('express');
const axios = require('axios');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
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

  let car1ProcessedPath, car2ProcessedPath;
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
  } catch (error) {
    console.error('Preprocessing error:', error.message);
    await fs.unlink(car1Path).catch(() => {});
    await fs.unlink(car2Path).catch(() => {});
    await fs.unlink(car1ProcessedPath).catch(() => {});
    await fs.unlink(car2ProcessedPath).catch(() => {});
    return res.status(400).send(`Preprocessing failed: ${error.message}`);
  }

  try {
    // Craft prompt for generation
    console.log('Crafting prompt for generation...');
    const prompt = `A single, photorealistic hybrid car seamlessly fused from unique parts of a ${car1Name} and 
a ${car2Name}, shown from a perfect side profile with the entire car (front bumper to rear bumper) fully 
visible, perfectly centered with generous space on all sides on a 1024x1792 white background, with vibrant 
colors, detailed styling, and a natural, unified design, ensuring no cropping.`;

    // Send to OpenAI generations endpoint
    console.log('Sending request to OpenAI...');
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        prompt: prompt,
        n: 1,
        size: '1024x1792'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const fusedImage = response.data.data[0].url;

    // Cleanup
    await fs.unlink(car1Path).catch(() => {});
    await fs.unlink(car2Path).catch(() => {});
    await fs.unlink(car1ProcessedPath).catch(() => {});
    await fs.unlink(car2ProcessedPath).catch(() => {});

    res.json({
      image: fusedImage
      // No description as per your request
    });
  } catch (error) {
    console.error('Fusion error details:', error.response ? error.response.data : error.message);
    await fs.unlink(car1Path).catch(() => {});
    await fs.unlink(car2Path).catch(() => {});
    await fs.unlink(car1ProcessedPath).catch(() => {});
    await fs.unlink(car2ProcessedPath).catch(() => {});
    res.status(500).send(`Fusion failed: ${error.response ? error.response.data.message : error.message}`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));

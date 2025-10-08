import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

// Use require() for gif-encoder-2
// @ts-ignore
const GIFEncoder = require('gif-encoder-2');

async function testGifGeneration() {
  console.log('Starting GIF generation test');
  
  const width = 200;
  const height = 200;
  const encoder = new GIFEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  console.log('Initialized GIF encoder and canvas');
  
  // Start the encoder
  encoder.start();
  encoder.setRepeat(0); // 0 for repeat
  encoder.setDelay(100); // 100ms delay between frames
  encoder.setQuality(10); // Lower is better quality
  
  console.log('GIF encoder configuration set');
  
  // Generate 10 frames
  for (let i = 0; i < 10; i++) {
    console.log(`Creating frame ${i + 1}`);
    
    // Clear canvas
    ctx.fillStyle = `rgb(${i * 25}, 0, ${255 - i * 25})`;
    ctx.fillRect(0, 0, width, height);
    
    // Add text
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Frame ${i + 1}`, width / 2, height / 2);
    
    // Add frame to GIF
    try {
      encoder.addFrame(ctx as any);
      console.log(`Added frame ${i + 1}`);
    } catch (error) {
      console.error(`Error adding frame ${i + 1}:`, error);
    }
  }
  
  console.log('Finishing GIF encoding');
  encoder.finish();
  
  const outputPath = path.join(process.cwd(), 'test-output.gif');
  const buffer = encoder.out.getData();
  console.log(`Generated GIF buffer with size: ${buffer.length} bytes`);
  
  fs.writeFileSync(outputPath, buffer);
  console.log(`GIF saved to: ${outputPath}`);
}

testGifGeneration().catch(error => {
  console.error('Test failed with error:', error);
}); 
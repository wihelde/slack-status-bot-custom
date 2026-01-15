#!/usr/bin/env node

/**
 * Generate a DMG background image with installation instructions
 * Creates a 540x417 PNG image for the DMG
 */

const fs = require('fs');
const path = require('path');

// Try to use canvas library if available, otherwise just document the setup
try {
  const Canvas = require('canvas');
  
  const width = 540;
  const height = 417;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#f0f4f8');
  gradient.addColorStop(1, '#d9e4f0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI"';
  ctx.textAlign = 'center';
  ctx.fillText('Slack Status Bot Installation', width / 2, 60);

  // Instruction box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(30, 90, width - 60, 140);
  
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 90, width - 60, 140);

  // Instructions
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI"';
  ctx.textAlign = 'left';
  ctx.fillText('1. Double-click "Install.command"', 50, 120);
  ctx.fillText('2. Enter your password when prompted to install the app', 50, 145);
  ctx.fillText('3. The app will open automatically', 50, 170);

  // Bottom info
  ctx.fillStyle = '#666666';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI"';
  ctx.textAlign = 'center';
  ctx.fillText('Install.command handles everything for you →', width / 2, 390);

  // Write file
  const outputPath = path.join(__dirname, '..', 'build-assets', 'dmg-background.png');
  const dir = path.dirname(outputPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = canvas.createPNGStream();
  const writeStream = fs.createWriteStream(outputPath);
  
  stream.pipe(writeStream);
  writeStream.on('finish', () => {
    console.log('✅ DMG background generated at:', outputPath);
  });
  
} catch (err) {
  console.error('Note: canvas library not installed. For DMG background image support, run:');
  console.error('npm install canvas --save-dev');
  console.error('\nAlternatively, create a 540x417 PNG at: app/build-assets/dmg-background.png');
}

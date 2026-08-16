/**
 * Fügt allen Screenshots einen subtilen Rahmen hinzu.
 * 
 * Verwendung:
 *   npm install sharp
 *   node scripts/add-border.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'media', 'screenshots');
const BORDER_WIDTH = 2;
const BORDER_COLOR = '#404040';

async function addBorder(inputPath) {
  const filename = path.basename(inputPath);
  const outputPath = inputPath; // Überschreiben
  const tempPath = inputPath + '.tmp.png';

  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    const newWidth = metadata.width + (BORDER_WIDTH * 2);
    const newHeight = metadata.height + (BORDER_WIDTH * 2);

    // Neues Bild mit Rahmenfarbe als Hintergrund erstellen
    // und das Original zentriert darauf platzieren
    await sharp({
      create: {
        width: newWidth,
        height: newHeight,
        channels: 4,
        background: BORDER_COLOR
      }
    })
    .composite([{
      input: inputPath,
      top: BORDER_WIDTH,
      left: BORDER_WIDTH
    }])
    .png()
    .toFile(tempPath);

    // Temp-Datei umbenennen
    fs.renameSync(tempPath, outputPath);
    console.log(`✓ ${filename} (${metadata.width}x${metadata.height} → ${newWidth}x${newHeight})`);
  } catch (err) {
    console.error(`✗ ${filename}: ${err.message}`);
    // Temp-Datei aufräumen falls vorhanden
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

async function main() {
  console.log('Adding borders to screenshots...\n');
  console.log(`Border: ${BORDER_WIDTH}px ${BORDER_COLOR}\n`);

  const files = fs.readdirSync(SCREENSHOTS_DIR)
    .filter(f => f.endsWith('.png') && !f.includes('README'));

  if (files.length === 0) {
    console.log('Keine PNG-Dateien gefunden in:', SCREENSHOTS_DIR);
    return;
  }

  for (const file of files) {
    await addBorder(path.join(SCREENSHOTS_DIR, file));
  }

  console.log('\nFertig!');
}

main().catch(console.error);

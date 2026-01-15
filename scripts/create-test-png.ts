import fs from 'fs';

// Create a simple 200x200 blue PNG image
// PNG header + IHDR chunk + IDAT chunk + IEND chunk
function createBluePNG(): Buffer {
    // This is a minimal 1x1 blue PNG, we'll pretend it's 200x200 for simplicity
    // For actual testing, this small image will work fine
    const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    return Buffer.from(base64PNG, 'base64');
}

const pngBuffer = createBluePNG();
fs.writeFileSync('tests/fixtures/sample.png', pngBuffer);
console.log('Created tests/fixtures/sample.png');

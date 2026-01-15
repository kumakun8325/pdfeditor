import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';

async function createTestPdf() {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // A4 サイズ
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText('Test Page for E2E Testing', {
        x: 50,
        y: 700,
        size: 24,
        font,
        color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    const outputPath = 'tests/fixtures/sample.pdf';
    fs.writeFileSync(outputPath, pdfBytes);
    console.log('Created tests/fixtures/sample.pdf');
}

createTestPdf().catch(console.error);

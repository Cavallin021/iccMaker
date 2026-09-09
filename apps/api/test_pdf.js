const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function testPdf() {
  const pdfPath = path.resolve(__dirname, '../../../LOUVORES DA CAPITAL 2025.pdf');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  try {
    const data = await pdf(dataBuffer);
    const text = data.text;
    fs.writeFileSync(path.resolve(__dirname, 'pdf_output.txt'), text);
    console.log('Text extracted and saved to pdf_output.txt');
  } catch (err) {
    console.error(err);
  }
}

testPdf();

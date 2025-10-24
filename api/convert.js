const fs = require('fs');
const path = require('path');
const os = require('os');
const formidable = require('formidable');
const { convertToHTML, convertToPDF, convertToDOCX } = require('../lib/conversion');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = formidable({ multiples: false, uploadDir: os.tmpdir(), keepExtensions: true });

  await new Promise((resolve) => {
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.status(400).json({ error: 'Invalid form data' });
        return resolve();
      }

      try {
        const format = String(fields.format || 'pdf');
        const options = {
          headerText: fields.headerText || '',
          pageNumbers: fields.pageNumbers === 'true',
          headerAlign: fields.headerAlign || 'left',
          footerAlign: fields.footerAlign || 'center',
          includeDate: fields.includeDate === 'true',
          outputTheme: fields.outputTheme || 'default',
          fontFamily: fields.fontFamily || 'system',
          codeTheme: fields.codeTheme || 'github',
          pageSize: fields.pageSize || 'A4',
          customCSS: fields.customCSS || '',
        };

        const file = files.markdown;
        if (!file) {
          res.status(400).json({ error: 'No file uploaded' });
          return resolve();
        }

        const filepath = file.filepath || file.path;
        const filename = (file.originalFilename || file.name || 'document.md');
        const markdownContent = fs.readFileSync(filepath, 'utf8');

        let buffer;
        let outName;
        if (format === 'html') {
          buffer = await convertToHTML(markdownContent, filename.replace(/\.md$/i, ''), options);
          outName = filename.replace(/\.md$/i, '.html');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (format === 'docx') {
          buffer = await convertToDOCX(markdownContent, filename.replace(/\.md$/i, ''), options);
          outName = filename.replace(/\.md$/i, '.docx');
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else {
          buffer = await convertToPDF(markdownContent, filename.replace(/\.md$/i, ''), options);
          outName = filename.replace(/\.md$/i, '.pdf');
          res.setHeader('Content-Type', 'application/pdf');
        }

        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        res.status(200).send(Buffer.from(buffer));
      } catch (e) {
        console.error('Conversion error:', e);
        res.status(500).json({ error: 'Conversion failed', details: e.message });
      } finally {
        resolve();
      }
    });
  });
};

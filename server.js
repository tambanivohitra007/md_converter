const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { marked } = require('marked');
const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const HTMLtoDOCX = require('html-to-docx');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory job store for progress reporting via SSE
const jobs = new Map();

function initJob(jobId) {
  if (!jobId) return null;
  let job = jobs.get(jobId);
  if (!job) {
    job = { progress: 0, message: 'Starting', subscribers: new Set(), status: 'pending' };
    jobs.set(jobId, job);
  }
  return job;
}

function updateProgress(jobId, progress, message) {
  if (!jobId) return;
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress = Math.max(0, Math.min(100, Math.floor(progress)));
  if (message) job.message = message;
  const payload = `data: ${JSON.stringify({ progress: job.progress, message: job.message })}\n\n`;
  for (const res of job.subscribers) {
    try { res.write(payload); } catch (_) {}
  }
}

function completeJob(jobId) {
  if (!jobId) return;
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'done';
  updateProgress(jobId, 100, 'Done');
  // Close and cleanup subscribers after a short delay
  setTimeout(() => {
    for (const res of job.subscribers) {
      try { res.end(); } catch (_) {}
    }
    job.subscribers.clear();
    // Optionally keep job for a while; here we clean up after 60s
    setTimeout(() => jobs.delete(jobId), 60000);
  }, 250);
}

// SSE endpoint
app.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = initJob(jobId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  // Reconnect hint
  res.write('retry: 1500\n');
  // Send initial state
  res.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message })}\n\n`);
  job.subscribers.add(res);
  req.on('close', () => {
    try { job.subscribers.delete(res); } catch (_) {}
  });
});

// Basic request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Configure multer for file uploads
const uploadDir = path.join(__dirname, 'uploads');
// Ensure uploads dir exists at startup
fs.mkdir(uploadDir, { recursive: true }).catch((err) => {
  console.error('Error creating upload directory:', err);
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.md') {
      cb(null, true);
    } else {
      cb(new Error('Only .md files are allowed!'), false);
    }
  }
});

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Mermaid rendering function using Puppeteer
async function renderMermaidToImage(mermaidCode) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
          mermaid.initialize({ startOnLoad: true, theme: 'default' });
        </script>
      </head>
      <body>
        <div class="mermaid">
${mermaidCode}
        </div>
      </body>
      </html>
    `;
    
    await page.setContent(html);
    await page.waitForSelector('.mermaid svg', { timeout: 10000 });
    
    const element = await page.$('.mermaid');
    const screenshot = await element.screenshot({ type: 'png' });
    
    return screenshot.toString('base64');
  } finally {
    await browser.close();
  }
}

// Process Markdown content and extract Mermaid diagrams
async function processMermaidDiagrams(markdownContent, format, opts = {}) {
  const { jobId = null, start = 5, end = 60 } = opts; // default weighted range
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  const diagrams = [];
  let match;
  
  while ((match = mermaidRegex.exec(markdownContent)) !== null) {
    diagrams.push({
      original: match[0],
      code: match[1].trim(),
      index: match.index
    });
  }
  
  if (format === 'html') {
    // For HTML, keep mermaid blocks as-is for client-side rendering
    updateProgress(jobId, start, 'Parsing markdown');
    return markdownContent;
  } else {
    // For PDF and DOCX, replace mermaid blocks with image tags
    let processedContent = markdownContent;
    const total = diagrams.length;
    const span = Math.max(0, end - start);
    let current = start;
    
    for (let i = diagrams.length - 1; i >= 0; i--) {
      const diagram = diagrams[i];
      try {
        const imageBase64 = await renderMermaidToImage(diagram.code);
        const imageTag = `![Mermaid Diagram](data:image/png;base64,${imageBase64})`;
        
        processedContent = 
          processedContent.substring(0, diagram.index) + 
          imageTag + 
          processedContent.substring(diagram.index + diagram.original.length);
        if (total > 0) {
          current = start + Math.floor((span * (total - i)) / total);
          updateProgress(jobId, Math.min(current, end), `Rendered diagram ${total - i}/${total}`);
        }
      } catch (error) {
        console.error('Error rendering mermaid diagram:', error);
        // Keep original if rendering fails
      }
    }
    
    return processedContent;
  }
}

// Convert to HTML
async function convertToHTML(markdownContent, filename, jobId) {
  updateProgress(jobId, 1, 'Starting');
  const processedContent = await processMermaidDiagrams(markdownContent, 'html', { jobId, start: 5, end: 40 });
  const htmlContent = marked(processedContent);
  updateProgress(jobId, 80, 'Generating HTML');
  
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background-color: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    table th, table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    table th {
      background-color: #f4f4f4;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 20px;
      color: #666;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;
  
  updateProgress(jobId, 95, 'Finalizing');
  return fullHTML;
}

// Convert to PDF
async function convertToPDF(markdownContent, filename, jobId, opts = {}) {
  const {
    headerText = '',
    pageNumbers = true,
    headerAlign = 'left', // left|center|right
    footerAlign = 'center', // left|center|right
    includeDate = false,
  } = opts;
  updateProgress(jobId, 1, 'Starting');
  const processedContent = await processMermaidDiagrams(markdownContent, 'pdf', { jobId, start: 5, end: 60 });
  const htmlContent = marked(processedContent);
  updateProgress(jobId, 70, 'Preparing PDF');
  
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background-color: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 20px auto;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    table th, table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    table th {
      background-color: #f4f4f4;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 20px;
      color: #666;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });
    updateProgress(jobId, 85, 'Rendering PDF');
    const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
    const headerStr = headerText ? headerText.replace(/</g, '&lt;').replace(/>/g, '&gt;') : filename;
    const dateStr = includeDate ? new Date().toLocaleDateString() : '';
    const headerTemplate = `
      <div style="font-size:10px; width:100%; padding:0 10mm; display:flex; justify-content:${justifyMap[headerAlign] || 'flex-start'}; color:#555; gap:8px;">
        <span>${headerStr}</span>
        ${includeDate ? `<span style=\"opacity:.85\">${dateStr}</span>` : ''}
      </div>`;
    const footerTemplate = pageNumbers ? `
      <div style="font-size:10px; width:100%; padding:0 10mm; color:#555; display:flex; justify-content:${justifyMap[footerAlign] || 'center'};">
        <span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span>
      </div>` : '<div></div>';
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: headerText ? '25mm' : '20mm',
        right: '20mm',
        bottom: pageNumbers ? '25mm' : '20mm',
        left: '20mm'
      },
      printBackground: true,
      displayHeaderFooter: !!(headerText || pageNumbers),
      headerTemplate,
      footerTemplate
    });
    updateProgress(jobId, 95, 'Finalizing');
    
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

// Convert to DOCX
async function convertToDOCX(markdownContent, filename, jobId, opts = {}) {
  const {
    headerText = '',
    pageNumbers = true,
    headerAlign = 'left',
    includeDate = false,
  } = opts;
  updateProgress(jobId, 1, 'Starting');
  const processedContent = await processMermaidDiagrams(markdownContent, 'docx', { jobId, start: 5, end: 60 });
  const htmlContent = marked(processedContent);
  updateProgress(jobId, 70, 'Preparing DOCX');
  
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background-color: #f4f4f4;
      padding: 15px;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    img {
      max-width: 100%;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    table th, table td {
      border: 1px solid #000;
      padding: 8px;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;
  
  const textAlign = headerAlign === 'center' ? 'center' : (headerAlign === 'right' ? 'right' : 'left');
  const headerSafeText = headerText ? headerText.replace(/</g, '&lt;').replace(/>/g, '&gt;') : filename;
  const headerHTML = `<div style="font-size:10pt; color:#555; text-align:${textAlign};">${headerSafeText}${includeDate ? ` &nbsp; <span style=\"opacity:.85\">${new Date().toLocaleDateString()}</span>` : ''}</div>`;

  const docxBuffer = await HTMLtoDOCX(fullHTML, headerHTML, {
    table: { row: { cantSplit: true } },
    header: true,
    footer: !!pageNumbers,
    pageNumber: !!pageNumbers,
  });
  updateProgress(jobId, 95, 'Finalizing');
  
  return docxBuffer;
}

// Upload and convert endpoint
app.post('/convert', upload.single('markdown'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const format = req.body.format;
  const headerText = (req.body.headerText || '').toString().slice(0, 200);
  const pageNumbers = req.body.pageNumbers === undefined ? true : (String(req.body.pageNumbers).toLowerCase() !== 'false');
  const headerAlign = ['left', 'center', 'right'].includes(req.body.headerAlign) ? req.body.headerAlign : 'left';
  const footerAlign = ['left', 'center', 'right'].includes(req.body.footerAlign) ? req.body.footerAlign : 'center';
  const includeDate = String(req.body.includeDate).toLowerCase() === 'true';
    const jobId = req.body.jobId || null;
    if (jobId) {
      initJob(jobId);
      updateProgress(jobId, 1, 'Upload received');
    }
    if (!['html', 'pdf', 'docx'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    
    console.log(`Starting conversion: file="${req.file.originalname}", format=${format}, size=${req.file.size} bytes`);

    const markdownContent = await fs.readFile(req.file.path, 'utf-8');
    updateProgress(jobId, 5, 'Reading file');
    const baseFilename = path.basename(req.file.originalname, '.md');
    
    let result;
    let contentType;
    let fileExtension;
    
    switch (format) {
      case 'html':
        result = await convertToHTML(markdownContent, baseFilename, jobId);
        contentType = 'text/html';
        fileExtension = 'html';
        break;
      case 'pdf':
        result = await convertToPDF(markdownContent, baseFilename, jobId, { headerText, pageNumbers, headerAlign, footerAlign, includeDate });
        contentType = 'application/pdf';
        fileExtension = 'pdf';
        break;
      case 'docx':
        result = await convertToDOCX(markdownContent, baseFilename, jobId, { headerText, pageNumbers, headerAlign, includeDate });
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        fileExtension = 'docx';
        break;
    }
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    
    // Send the converted file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.${fileExtension}"`);
    res.send(result);
    console.log(`Conversion complete: ${baseFilename}.${fileExtension}`);
    completeJob(jobId);
    
  } catch (error) {
    console.error('Conversion error:', error);
    const jobId = req.body?.jobId;
    updateProgress(jobId, 100, 'Error');
    res.status(500).json({ error: 'Conversion failed: ' + error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler (Express 5)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Process-level error logging
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

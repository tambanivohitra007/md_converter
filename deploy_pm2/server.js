import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import HTMLtoDOCXImport from 'html-to-docx';

const HTMLtoDOCX = HTMLtoDOCXImport?.default ?? HTMLtoDOCXImport;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.use(express.static(path.join(__dirname, 'public')));
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

// Generate theme-specific CSS
function getThemeCSS(themeName = 'default', fontFamily = 'system', codeTheme = 'github') {
  const themes = {
    default: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f9fafb',
      textPrimary: '#1f2937',
      textSecondary: '#6b7280',
      borderColor: '#e5e7eb',
      primaryColor: '#4f46e5',
      codeBackground: '#f6f8fa',
      codeBorder: '#d0d7de'
    },
    github: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f6f8fa',
      textPrimary: '#24292f',
      textSecondary: '#57606a',
      borderColor: '#d0d7de',
      primaryColor: '#0969da',
      codeBackground: '#f6f8fa',
      codeBorder: '#d0d7de'
    },
    vscode: {
      bgPrimary: '#1e1e1e',
      bgSecondary: '#252526',
      textPrimary: '#d4d4d4',
      textSecondary: '#858585',
      borderColor: '#3e3e42',
      primaryColor: '#007acc',
      codeBackground: '#1e1e1e',
      codeBorder: '#3e3e42'
    },
    dracula: {
      bgPrimary: '#282a36',
      bgSecondary: '#21222c',
      textPrimary: '#f8f8f2',
      textSecondary: '#6272a4',
      borderColor: '#44475a',
      primaryColor: '#bd93f9',
      codeBackground: '#21222c',
      codeBorder: '#44475a'
    },
    nord: {
      bgPrimary: '#2e3440',
      bgSecondary: '#3b4252',
      textPrimary: '#eceff4',
      textSecondary: '#d8dee9',
      borderColor: '#4c566a',
      primaryColor: '#88c0d0',
      codeBackground: '#3b4252',
      codeBorder: '#4c566a'
    },
    solarized: {
      bgPrimary: '#fdf6e3',
      bgSecondary: '#eee8d5',
      textPrimary: '#657b83',
      textSecondary: '#93a1a1',
      borderColor: '#eee8d5',
      primaryColor: '#268bd2',
      codeBackground: '#eee8d5',
      codeBorder: '#93a1a1'
    }
  };
  
  const fonts = {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    'sans-serif': "Arial, Helvetica, 'Helvetica Neue', sans-serif",
    monospace: "'Courier New', Courier, 'Lucida Console', Monaco, monospace"
  };
  
  const codeThemes = {
    github: {
      background: '#f6f8fa',
      border: '#d0d7de',
      color: '#24292f'
    },
    monokai: {
      background: '#272822',
      border: '#3e3d32',
      color: '#f8f8f2'
    },
    dracula: {
      background: '#282a36',
      border: '#44475a',
      color: '#f8f8f2'
    },
    nord: {
      background: '#2e3440',
      border: '#3b4252',
      color: '#d8dee9'
    },
    'atom-one-dark': {
      background: '#282c34',
      border: '#3e4451',
      color: '#abb2bf'
    },
    'tomorrow-night': {
      background: '#1d1f21',
      border: '#373b41',
      color: '#c5c8c6'
    }
  };
  
  const theme = themes[themeName] || themes.default;
  const fontFamilyValue = fonts[fontFamily] || fonts.system;
  const codeStyle = codeThemes[codeTheme] || codeThemes.github;
  
  return `
    :root {
      --bg-primary: ${theme.bgPrimary};
      --bg-secondary: ${theme.bgSecondary};
      --bg-sidebar: ${theme.bgSecondary};
      --text-primary: ${theme.textPrimary};
      --text-secondary: ${theme.textSecondary};
      --border-color: ${theme.borderColor};
      --primary-color: ${theme.primaryColor};
      --code-background: ${codeStyle.background};
      --code-border: ${codeStyle.border};
      --code-color: ${codeStyle.color};
      --font-family: ${fontFamilyValue};
    }
    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-family);
    }
    code {
      background: var(--code-background);
      border: 1px solid var(--code-border);
      color: var(--code-color);
    }
    pre code {
      background: var(--code-background);
      color: var(--code-color);
    }
  `;
}

// Convert to HTML with sidebar navigation
async function convertToHTML(markdownContent, filename, jobId, options = {}) {
  updateProgress(jobId, 1, 'Starting');
  // Pre-render Mermaid diagrams to images (like PDF/DOCX)
  const processedContent = await processMermaidDiagrams(markdownContent, 'pdf', { jobId, start: 5, end: 50 });
  updateProgress(jobId, 60, 'Parsing markdown');
  const htmlContent = marked(processedContent);
  updateProgress(jobId, 70, 'Building navigation');
  
  // Parse headings and build sidebar navigation
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const navItems = [];
  
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.substring(1));
    const text = heading.textContent.trim();
    const id = `heading-${index}`;
    heading.setAttribute('id', id);
    navItems.push({ level, text, id });
  });
  
  const finalHTML = dom.serialize();
  
  // Build nested navigation HTML
  let navHTML = '<ul class="nav-list">';
  navItems.forEach(item => {
    const indent = (item.level - 1) * 16;
    navHTML += `<li class="nav-item nav-level-${item.level}" style="padding-left: ${indent}px;"><a href="#${item.id}">${item.text}</a></li>`;
  });
  navHTML += '</ul>';
  
  updateProgress(jobId, 85, 'Generating HTML');
  
  // Get theme CSS
  const themeCSS = getThemeCSS(
    options.outputTheme || 'default',
    options.fontFamily || 'system',
    options.codeTheme || 'github'
  );
  
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    ${themeCSS}
    :root {
      --sidebar-width: 280px;
    }
    body {
      line-height: 1.7;
      display: flex;
      min-height: 100vh;
    }
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      width: var(--sidebar-width);
      height: 100vh;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      overflow-y: auto;
      padding: 24px 16px;
      z-index: 100;
      transition: transform 0.3s ease;
    }
    .sidebar-header {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 20px;
      color: var(--text-primary);
      padding-bottom: 12px;
      border-bottom: 2px solid var(--border-color);
    }
    .nav-list {
      list-style: none;
    }
    .nav-item {
      margin: 4px 0;
    }
    .nav-item a {
      display: block;
      padding: 6px 12px;
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: 6px;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    .nav-item a:hover {
      background: white;
      color: var(--primary-color);
    }
    .nav-level-1 a {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .nav-level-2 a {
      font-weight: 500;
    }
    .main-content {
      margin-left: var(--sidebar-width);
      flex: 1;
      padding: 40px 60px;
      max-width: 1200px;
    }
    .mobile-toggle {
      display: none;
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 200;
      background: var(--primary-color);
      color: white;
      border: none;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1.2rem;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.6em;
      font-weight: 600;
      line-height: 1.3;
      scroll-margin-top: 20px;
    }
    h1 { font-size: 2.25rem; color: var(--text-primary); border-bottom: 2px solid var(--border-color); padding-bottom: 12px; }
    h2 { font-size: 1.75rem; color: var(--text-primary); }
    h3 { font-size: 1.4rem; }
    h4 { font-size: 1.15rem; }
    h5 { font-size: 1rem; }
    h6 { font-size: 0.95rem; color: var(--text-secondary); }
    p {
      margin: 1em 0;
    }
    code {
      background-color: var(--code-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', Consolas, monospace;
      font-size: 0.9em; color: var(--code-color);
    }
    pre {
      background-color: var(--code-background);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1.5em 0;
      border: 1px solid var(--code-border);
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1.5em 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.5em 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    table th, table td {
      border: 1px solid var(--border-color);
      padding: 12px 16px;
      text-align: left;
    }
    table th {
      background-color: var(--bg-sidebar);
      font-weight: 600;
    }
    table tr:hover {
      background-color: #fafafa;
    }
    blockquote {
      border: 1px solid var(--code-border);
      padding-left: 20px;
      color: var(--text-secondary);
      margin: 1.5em 0;
      font-style: italic;
    }
    a {
      color: var(--primary-color);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      margin: 1em 0;
      padding-left: 2em;
    }
    li {
      margin: 0.5em 0;
    }
    @media (max-width: 768px) {
      .sidebar {
        transform: translateX(-100%);
      }
      .sidebar.active {
        transform: translateX(0);
      }
      .main-content {
        margin-left: 0;
        padding: 80px 20px 40px;
      }
      .mobile-toggle {
        display: block;
      }
    }
    ${options.customCSS || ''}
  </style>
</head>
<body>
  <button class="mobile-toggle" onclick="document.querySelector('.sidebar').classList.toggle('active')" aria-label="Toggle navigation">☰</button>
  <aside class="sidebar">
    <div class="sidebar-header">Contents</div>
    ${navHTML}
  </aside>
  <main class="main-content">
    ${finalHTML}
  </main>
  <script>
    // Smooth scroll and close mobile menu on link click
    document.querySelectorAll('.nav-item a').forEach(link => {
      link.addEventListener('click', (e) => {
        document.querySelector('.sidebar').classList.remove('active');
      });
    });
    // Highlight active section
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.querySelectorAll('.nav-item a').forEach(a => a.style.fontWeight = '');
          const activeLink = document.querySelector('.nav-item a[href="#' + entry.target.id + '"]');
          if (activeLink) activeLink.style.fontWeight = 'bold';
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => observer.observe(h));
  </script>
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
    outputTheme = 'default',
    fontFamily = 'system',
    codeTheme = 'github',
    pageSize = 'A4',
    customCSS = ''
  } = opts;
  updateProgress(jobId, 1, 'Starting');
  const processedContent = await processMermaidDiagrams(markdownContent, 'pdf', { jobId, start: 5, end: 60 });
  const htmlContent = marked(processedContent);
  updateProgress(jobId, 70, 'Preparing PDF');
  
  // Get theme CSS
  const themeCSS = getThemeCSS(outputTheme, fontFamily, codeTheme);
  
  const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    ${themeCSS}
    body {
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    code {
      background-color: var(--code-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      color: var(--code-color);
    }
    pre {
      background-color: var(--code-background);
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      border: 1px solid var(--code-border);
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
      border: 1px solid var(--border-color);
      padding: 12px;
      text-align: left;
    }
    table th {
      background-color: var(--bg-secondary);
    }
    blockquote {
      border-left: 4px solid var(--border-color);
      padding-left: 20px;
      color: var(--text-secondary);
      margin: 20px 0;
    }
    ${customCSS}
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
    
    const pdfOptions = {
      format: pageSize,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      },
      printBackground: true
    };
    
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
      background-color: var(--code-background);
      padding: 2px 6px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background-color: var(--code-background);
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
    
    // Advanced customization options
    const outputTheme = req.body.outputTheme || 'default';
    const fontFamily = req.body.fontFamily || 'system';
    const codeTheme = req.body.codeTheme || 'github';
    const pageSize = req.body.pageSize || 'A4';
    const customCSS = req.body.customCSS || '';
    
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
    
    // Prepare options object
    const conversionOptions = {
      headerText,
      pageNumbers,
      headerAlign,
      footerAlign,
      includeDate,
      outputTheme,
      fontFamily,
      codeTheme,
      pageSize,
      customCSS
    };
    
    let result;
    let contentType;
    let fileExtension;
    
    switch (format) {
      case 'html':
        result = await convertToHTML(markdownContent, baseFilename, jobId, conversionOptions);
        contentType = 'text/html';
        fileExtension = 'html';
        break;
      case 'pdf':
        result = await convertToPDF(markdownContent, baseFilename, jobId, conversionOptions);
        contentType = 'application/pdf';
        fileExtension = 'pdf';
        break;
      case 'docx':
        result = await convertToDOCX(markdownContent, baseFilename, jobId, conversionOptions);
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

// Global error handler (Express 5)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString() 
  });
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

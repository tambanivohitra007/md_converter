const { marked } = require('marked');
const HTMLtoDOCX = require('html-to-docx');

function getThemeCSS(themeName = 'default', fontFamily = 'system', codeTheme = 'github') {
  const themes = {
    default: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f7f7f8',
      text: '#1f2937',
      border: '#e5e7eb',
      codeBackground: '#f4f4f5',
      codeColor: '#111827',
      codeBorder: '#e5e7eb',
    },
    github: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f6f8fa',
      text: '#24292e',
      border: '#d0d7de',
      codeBackground: '#f6f8fa',
      codeColor: '#24292e',
      codeBorder: '#d0d7de',
    },
    vscode: {
      bgPrimary: '#1e1e1e',
      bgSecondary: '#252526',
      text: '#e0e0e0',
      border: '#3c3c3c',
      codeBackground: '#1e1e1e',
      codeColor: '#d4d4d4',
      codeBorder: '#3c3c3c',
    },
    dracula: {
      bgPrimary: '#282a36',
      bgSecondary: '#343746',
      text: '#f8f8f2',
      border: '#44475a',
      codeBackground: '#1e1f29',
      codeColor: '#f8f8f2',
      codeBorder: '#44475a',
    },
    nord: {
      bgPrimary: '#2e3440',
      bgSecondary: '#3b4252',
      text: '#e5e9f0',
      border: '#4c566a',
      codeBackground: '#3b4252',
      codeColor: '#e5e9f0',
      codeBorder: '#4c566a',
    },
    solarized: {
      bgPrimary: '#fdf6e3',
      bgSecondary: '#eee8d5',
      text: '#657b83',
      border: '#e5e5e5',
      codeBackground: '#f5ecd2',
      codeColor: '#586e75',
      codeBorder: '#e5e5e5',
    },
  };

  const fonts = {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif",
    'sans-serif': "Arial, Helvetica, 'Noto Sans', sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    monospace: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  };

  const theme = themes[themeName] || themes.default;
  const font = fonts[fontFamily] || fonts.system;

  return `:root{--bg-primary:${theme.bgPrimary};--bg-secondary:${theme.bgSecondary};--bg-sidebar:${theme.bgSecondary};--text-color:${theme.text};--border-color:${theme.border};--code-background:${theme.codeBackground};--code-color:${theme.codeColor};--code-border:${theme.codeBorder};--font-family:${font};}
  body{background:var(--bg-primary);color:var(--text-color);font-family:var(--font-family);}
  pre, code{background:var(--code-background);color:var(--code-color);}
  pre{border:1px solid var(--code-border);padding:12px;border-radius:8px;overflow:auto}
  table{border-collapse:collapse;width:100%;}
  table, th, td{border:1px solid var(--border-color);}
  th, td{padding:8px;}
  blockquote{border-left:4px solid var(--border-color);padding-left:12px;color:#6b7280;}
  hr{border-color:var(--border-color);} 
  `;
}

function buildHtml(markdownContent, options = {}) {
  const {
    title = 'Document',
    outputTheme = 'default',
    fontFamily = 'system',
    codeTheme = 'github',
    customCSS = '',
  } = options;

  const themeCss = getThemeCSS(outputTheme, fontFamily, codeTheme);
  const mdHtml = marked.parse(markdownContent || '');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>${themeCss}
${customCSS || ''}
</style>
<link rel="preconnect" href="https://cdn.jsdelivr.net"/>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>window.mermaid && mermaid.initialize({ startOnLoad: true, theme: 'default' });</script>
</head>
<body>
<main class="content">${mdHtml}</main>
</body>
</html>`;

  return html;
}

async function convertToHTML(markdownContent, filename, options) {
  const html = buildHtml(markdownContent, { ...options, title: filename || 'Document' });
  return Buffer.from(html, 'utf8');
}

async function convertToDOCX(markdownContent, filename, options) {
  const html = buildHtml(markdownContent, { ...options, title: filename || 'Document' });
  const buffer = await HTMLtoDOCX(html, null, { table: { row: { cantSplit: true } } });
  return buffer;
}

async function convertToPDF(markdownContent, filename, options) {
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');

  const html = buildHtml(markdownContent, { ...options, title: filename || 'Document' });

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' });
    await page.evaluate(async () => {
      if (window.mermaid) {
        try { await window.mermaid.run(); } catch (e) {}
      }
    });

    const pageSize = options?.pageSize || 'A4';
    const pdf = await page.pdf({ format: pageSize, printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { getThemeCSS, buildHtml, convertToHTML, convertToPDF, convertToDOCX };

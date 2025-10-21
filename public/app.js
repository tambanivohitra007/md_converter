// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileSelected = document.getElementById('fileSelected');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeBtn = document.getElementById('removeBtn');
const convertBtn = document.getElementById('convertBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressBadge = document.getElementById('progressBadge');

// Helper to create a jobId
function createJobId() {
  return 'job_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Progress helpers
function setProgress(percent, message) {
  const clamped = Math.max(0, Math.min(100, Math.floor(percent)));
  progressFill.style.width = clamped + '%';
  progressFill.style.animation = 'none';
  progressText.textContent = `${clamped}% - ${message || 'Working...'}`;
  if (progressBadge) progressBadge.textContent = `${clamped}%`;
}

let selectedFile = null;

// Format bytes to readable size
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Handle file selection
function handleFileSelect(file) {
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.md')) {
    alert('Please select a Markdown (.md) file');
    return;
  }
  
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  
  uploadArea.style.display = 'none';
  fileSelected.style.display = 'block';
  convertBtn.disabled = false;
}

// Click to upload
uploadArea.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  handleFileSelect(file);
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  
  const file = e.dataTransfer.files[0];
  handleFileSelect(file);
});

// Remove file
removeBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  uploadArea.style.display = 'block';
  fileSelected.style.display = 'none';
  convertBtn.disabled = true;
  progressSection.style.display = 'none';
});

// Convert file
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  
  const format = document.querySelector('input[name="format"]:checked').value;
  
  // Show progress
  progressSection.style.display = 'block';
  setProgress(0, `Starting ${format.toUpperCase()} conversion...`);
  convertBtn.disabled = true;
  
  try {
    const formData = new FormData();
    const jobId = createJobId();
    formData.append('markdown', selectedFile);
    formData.append('format', format);
    formData.append('jobId', jobId);
    const headerInput = document.getElementById('headerText');
    const pageNumbersInput = document.getElementById('pageNumbers');
  const headerAlignSelect = document.getElementById('headerAlign');
  const footerAlignSelect = document.getElementById('footerAlign');
  const includeDateInput = document.getElementById('includeDate');
    if (headerInput && headerInput.value) formData.append('headerText', headerInput.value);
    if (pageNumbersInput) formData.append('pageNumbers', pageNumbersInput.checked ? 'true' : 'false');
  if (headerAlignSelect) formData.append('headerAlign', headerAlignSelect.value);
  if (footerAlignSelect) formData.append('footerAlign', footerAlignSelect.value);
  if (includeDateInput) formData.append('includeDate', includeDateInput.checked ? 'true' : 'false');

    // Upload with progress using XHR to get progress percentage
    let currentUploadPercent = 0;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/convert');
    xhr.responseType = 'blob';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        currentUploadPercent = (event.loaded / event.total) * 100;
        const combined = (currentUploadPercent * 0.2); // first 0-20%
        setProgress(combined, 'Uploading file...');
      }
    };

    // Server progress via SSE (conversion phase ~ 20% -> 100%)
    const sse = new EventSource(`/progress/${jobId}`);
    let serverProgress = 0;
    sse.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        serverProgress = Number(data.progress) || 0;
        // Combine: upload (0-20), server (20-100)
        const combined = Math.max(currentUploadPercent * 0.2, 0) + (serverProgress * 0.8);
        setProgress(combined, data.message || 'Processing');
      } catch {}
    };
    sse.onerror = () => {
      // Ignore transient SSE drops; EventSource auto-reconnects
    };

    const responsePromise = new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr);
        } else {
          reject(new Error(`Conversion failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during conversion'));
    });

    xhr.send(formData);

    const xhrRes = await responsePromise;
    // Close SSE (server will also close on completion)
    try { sse.close(); } catch {}

    // Determine filename
    let downloadFilename = `converted.${format}`;
    const cd = xhrRes.getResponseHeader && xhrRes.getResponseHeader('Content-Disposition');
    if (cd) {
      const m = cd.match(/filename="(.+)"/);
      if (m) downloadFilename = m[1];
    }

    // Download
    const blob = xhrRes.response;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    setProgress(100, 'Completed');
    setTimeout(() => {
      progressSection.style.display = 'none';
      progressFill.style.width = '0%';
      progressFill.style.animation = 'progress 1.5s ease-in-out infinite';
    }, 1500);
    
  } catch (error) {
    console.error('Conversion error:', error);
    setProgress(100, `Error: ${error.message}`);
    progressFill.style.background = 'var(--danger-color)';
    progressFill.style.animation = 'none';
    
    setTimeout(() => {
      progressSection.style.display = 'none';
      progressFill.style.width = '0%';
      progressFill.style.background = 'linear-gradient(90deg, var(--primary-color), var(--secondary-color))';
      progressFill.style.animation = 'progress 1.5s ease-in-out infinite';
    }, 3000);
  } finally {
    convertBtn.disabled = false;
  }
});

// Prevent default drag behavior on the whole document
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
});

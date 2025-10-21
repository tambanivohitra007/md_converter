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
const themeToggle = document.getElementById('themeToggle');
const toastContainer = document.getElementById('toastContainer');

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
// Toast Notification System
const Toast = {
  show(type, title, message, duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
      success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
      error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      warning: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    
    toast.innerHTML = `
      ${icons[type] || icons.info}
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Close notification">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="11" y2="11"></line>
          <line x1="11" y1="1" x2="1" y2="11"></line>
        </svg>
      </button>
      ${duration > 0 ? `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>` : ''}
    `;
    
    const closeBtn = toast.querySelector('.toast-close');
    const remove = () => {
      toast.classList.add('hiding');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };
    
    closeBtn.addEventListener('click', remove);
    if (duration > 0) {
      setTimeout(remove, duration);
    }
    
    toastContainer.appendChild(toast);
    return toast;
  },
  
  success(title, message, duration) {
    return this.show('success', title, message, duration);
  },
  
  error(title, message, duration) {
    return this.show('error', title, message, duration);
  },
  
  warning(title, message, duration) {
    return this.show('warning', title, message, duration);
  },
  
  info(title, message, duration) {
    return this.show('info', title, message, duration);
  }
};

// Theme handling (dark mode)
(() => {
  const root = document.documentElement;
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored || (prefersDark ? 'dark' : 'light');
  if (initial === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = root.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }
})();

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
  
  // Validate file type
  if (!file.name.toLowerCase().endsWith('.md')) {
    Toast.error('Invalid File Type', 'Please select a Markdown (.md) file');
    return;
  }
  
  // Validate file size (10MB max)
  if (file.size > MAX_FILE_SIZE) {
    Toast.error(
      'File Too Large', 
      `Maximum file size is ${formatBytes(MAX_FILE_SIZE)}. Your file is ${formatBytes(file.size)}.`
    );
    return;
  }
  
  // Warn if file is large (over 5MB)
  if (file.size > 5 * 1024 * 1024) {
    Toast.warning(
      'Large File Detected',
      'This file is quite large. Conversion may take a while.',
      7000
    );
  }
  
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  
  uploadArea.classList.add('hidden');
  fileSelected.classList.remove('hidden');
  convertBtn.disabled = false;
  
  Toast.success('File Ready', `${file.name} is ready to convert`);
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
  uploadArea.classList.add('border-indigo-500');
  uploadArea.classList.add('dark:border-indigo-400');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('border-indigo-500');
  uploadArea.classList.remove('dark:border-indigo-400');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('border-indigo-500');
  uploadArea.classList.remove('dark:border-indigo-400');
  
  const file = e.dataTransfer.files[0];
  handleFileSelect(file);
});

// Remove file
removeBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  uploadArea.classList.remove('hidden');
  fileSelected.classList.add('hidden');
  convertBtn.disabled = true;
  progressSection.classList.add('hidden');
  Toast.info('File Removed', 'You can select another file to convert');
});

// Convert file
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  
  const format = document.querySelector('input[name="format"]:checked').value;
  
  // Show progress
  progressSection.classList.remove('hidden');
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
    Toast.success('Conversion Complete!', `Your ${format.toUpperCase()} file has been downloaded successfully`);
    
    setTimeout(() => {
      progressSection.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 1500);
    
  } catch (error) {
    console.error('Conversion error:', error);
    setProgress(100, `Error: ${error.message}`);
    progressFill.style.background = 'var(--danger-color)';
    progressFill.style.animation = 'none';
    
    Toast.error('Conversion Failed', error.message || 'An error occurred during conversion');
    
    setTimeout(() => {
      progressSection.classList.add('hidden');
      progressFill.style.width = '0%';
      progressFill.style.background = '';
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

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ✅ Auto uploads & history folders (Render-safe)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const historyDir = path.join(__dirname, 'scan_history');
if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir);
const historyLogPath = path.join(historyDir, 'history.jsonl');
const upload = multer({ dest: uploadsDir });

// 🔥 MAIN ENDPOINT: ImgBB → Google Lens
app.post('/guru-scan', upload.single('image'), async (req, res) => {
  try {
    console.log('🎯 Guru photo scanning...');
    const imagePath = req.file.path;
    const originalName = req.file.originalname || 'upload';

    console.log('📤 ImgBB upload...');
    const imgbbUrl = await uploadToImgBB(imagePath);

    console.log('🔍 Searching...');
    const lensResults = await googleLensSearch(imgbbUrl);

    // 📝 Persist scan info + keep a copy of original image
    try {
      const timestamp = Date.now();
      const scanFolder = path.join(historyDir, timestamp.toString());
      
      // create folder for this scan
      if (!fs.existsSync(scanFolder)) fs.mkdirSync(scanFolder, { recursive: true });

      // determine image extension from original name or default to .jpg
      const ext = path.extname(originalName) || '.jpg';
      const savedImageName = `image${ext}`;
      const savedImagePath = path.join(scanFolder, savedImageName);

      // keep a copy of the original uploaded image
      fs.copyFileSync(imagePath, savedImagePath);

      const entry = {
        id: timestamp,
        created_at: new Date(timestamp).toISOString(),
        original_image_path: savedImagePath,
        imgbb_url: imgbbUrl,
        total_matches: lensResults.length,
        results: lensResults
      };

      // append to history log (JSON Lines) for easy processing
      fs.appendFileSync(historyLogPath, JSON.stringify(entry) + '\n');

      // write pretty JSON file inside the scan folder
      const metaPath = path.join(scanFolder, 'meta.json');
      fs.writeFileSync(metaPath, JSON.stringify(entry, null, 2));
    } catch (persistErr) {
      console.error('Failed to persist scan history:', persistErr);
    }

    try { fs.unlinkSync(imagePath); } catch (e) { }

    res.json({
      success: true,
      results: lensResults,
      total_matches: lensResults.length
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function uploadToImgBB(imagePath) {
  // Use env key if set, otherwise fall back to the existing key
  const imgbbKey = process.env.IMGBB_API_KEY || '308e896a76d67e96b583934af45219ec';
  const formData = new FormData();
  formData.append('image', fs.createReadStream(imagePath));

  const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
    params: { key: imgbbKey },
    headers: formData.getHeaders()
  });

  return response.data.data.url;
}

async function googleLensSearch(imageUrl) {
  try {
    // Use env key if set, otherwise fall back to the existing key
    const serpApiKey = process.env.SERPAPI_API_KEY || 'ccba3afd27791484340ca6df5e15cc66a888ba689aed1cee53018ce433932c96';
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_lens',
        url: imageUrl,
        api_key: serpApiKey
      }
    });

    const results = [];
    if (response.data.visual_matches) {
      response.data.visual_matches.slice(0, 30).forEach(match => {
        results.push({
          title: match.title || 'Visual Match',
          source: match.source || 'Web',
          link: match.link || '#',
          image: match.thumbnail || match.image
        });
      });
    }
    return results.length ? results : demoResults();
  } catch {
    return demoResults();
  }
}

function demoResults() {
  return [
    { title: 'Facebook Guru Profile', source: 'Facebook', link: '#', image: 'https://via.placeholder.com/300x200/1877F2/fff' },
    { title: 'Twitter Guru Post', source: 'Twitter', link: '#', image: 'https://via.placeholder.com/300x200/1DA1F2/fff' }
  ];
}

// 🔥 FRONTEND
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width">
<title>SGPC Guru Scanner</title>

<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:system-ui;
  background: linear-gradient(
    to bottom,
    #1e3c72 0%,
    #2a5298 100%
  );
  color:white;
  padding:20px;
  min-height:100vh;
}

.container{
  max-width:1200px;
  margin:auto;
}

.header{
  text-align:center;
  margin:32px 0 24px;
}

.app-title{
  display:inline-block;
  padding:12px 28px;
  border-radius:999px;
  background:rgba(0,0,0,0.45);
  box-shadow:0 14px 40px rgba(0,0,0,0.45);
  border:1px solid rgba(0,255,136,0.4);
  font-size:26px;
}

.top-khanda,
.bottom-khanda{
  position:fixed;
  font-size:34px;
  background: linear-gradient(45deg, #FFD700, #FFB300, #FFD700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  opacity:0.95;
  pointer-events:none;
  z-index:5;
}

.top-khanda.left{ top:15px; left:15px; }
.top-khanda.right{ top:15px; right:15px; }

.bottom-khanda.left{ bottom:15px; left:15px; }
.bottom-khanda.right{ bottom:15px; right:15px; }

.gurbani-wrapper{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin:30px auto 20px;
  max-width: 1000px;
  padding:16px 24px;
  border-radius:24px;
  background: linear-gradient(
    135deg,
    rgba(0,0,0,0.45),
    rgba(0,0,0,0.25)
  );
  box-shadow: 0 14px 40px rgba(0,0,0,0.35);
  gap:20px;
}

.gurbani-logo{
  width:90px;
  height:90px;
  object-fit:contain;
}

.gurbani-text{
  flex:1;
  text-align:center;
  font-size:20px;
  line-height:1.6;
  color:#ffffff;
  opacity:0.95;
}

.upload-zone{
  border:4px dashed #00ff88;
  border-radius:25px;
  padding:80px 40px;
  text-align:center;
  background:rgba(0,255,136,.1);
}

.scan-btn{
  background:linear-gradient(45deg,#FF6B6B,#FF8E8E);
  border:none;
  padding:18px 50px;
  border-radius:50px;
  color:white;
  font-size:20px;
  font-weight:bold;
  cursor:pointer;
  margin-top:20px;
  transition: all 0.35s ease;
}

.scan-btn:disabled{opacity: 0.5;cursor: not-allowed;transform: none;box-shadow: none;}
.scan-btn:hover{transform: translateY(-3px) scale(1.03);box-shadow: 0 12px 30px rgba(0,0,0,.25);}
.scan-btn:focus-visible{outline:2px solid #00ff88; outline-offset:4px;}

.preview-wrapper{
  position:relative;
  margin:30px auto;
  width: 100%;
  display:none;
  justify-content:center;
  align-items:center;
}

.preview-inner{
  position:relative;
  display:inline-block;
  background: white;
  border-radius:18px;
  padding: 5px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  border:4px solid #00ff88;
  max-width: min(420px, 92vw);
}

.preview-inner img{
  display:block;
  width:auto;
  height:auto;
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius:14px;
}

#loading{
  position:absolute;
  inset:0;
  display:none; /* toggled to flex in JS */
  align-items:center;
  justify-content:center;
  padding:0;
  text-align:center;
  font-size:22px;
  font-weight:bold;
  letter-spacing:1px;
  color: #00ff88;
  text-shadow: 0 0 8px #00ff88, 0 0 15px #00ff88;
  background:rgba(0,0,0,0.35);
  backdrop-filter: blur(2px);
}

.scan-overlay{
  position:absolute;
  inset:0;
  border-radius:18px;
  box-shadow:0 0 35px rgba(0,255,136,.6);
  animation:pulse 1.2s ease-in-out infinite;
  overflow:hidden;
  background: rgba(0,255,136,0.05);
  background-image: linear-gradient(rgba(0,255,136,0.2) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0,255,136,0.2) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events:none;
}

.scan-line{
  position:absolute;
  left:0;
  width:100%;
  height:4px;
  background: linear-gradient(90deg, transparent, #00ff88, transparent);
  box-shadow: 0 0 20px #00ff88, 0 0 40px #00ff88;
  animation:scanMove 2s linear infinite alternate;
}

.scan-line::before,
.scan-line::after {
  content:"";
  position:absolute;
  left:0;
  width:100%;
  height:2px;
  background: #00ff88;
  box-shadow: 0 0 12px #00ff88, 0 0 25px #00ff88;
}

@keyframes scanMove{
  from{ top:0%; }
  to{ top:calc(100% - 4px); }
}

@keyframes pulse{
  0%{opacity:.2}
  50%{opacity:.8}
  100%{opacity:.2}
}

.results-grid{
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)); 
  gap: 18px;
  margin-top: 40px;
}

.result-card{
  background:white;
  color:#333;
  padding:18px;
  border-radius:16px;
  box-shadow:0 15px 35px rgba(0,0,0,.25);
  animation:slideIn .7s ease forwards;
  opacity:0;
}

.result-card h3{
  font-size:16px;
  font-weight:700;
  margin:10px 0 6px;
  line-height:1.4;
}

.result-card p{
  font-size:13px;
  margin-bottom:8px;
}

.result-card a{
  display:inline-flex;
  align-items:center;
  gap:4px;
  font-size:13px;
  text-decoration:none;
}

.result-card a:focus-visible{
  outline:2px solid #FF6B6B;
  outline-offset:3px;
  border-radius:6px;
}

.result-card{
  transition:transform .35s ease, box-shadow .35s ease;
}
.result-card:hover{
  transform:translateY(-10px);
  box-shadow:0 25px 45px rgba(0,0,0,.3);
}

.results-section{
  position: relative;
  margin-top: 30px;
  padding: 60px 20px;
  background: linear-gradient(
    to bottom,
    #1e3c72 0%,
    #234a86 50%,
    #2a5298 100%
  );
  border-radius: 30px;
}

.results-section::before{
  content:"";
  position:absolute;
  inset:0;
  background:linear-gradient(
    to bottom,
    rgba(255,255,255,0.05),
    rgba(0,0,0,0.25)
  );
  border-radius:30px;
  pointer-events:none;
}

.results-title{
  display: none;
  text-align: center;
  margin-bottom: 35px;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #00ff88;
  text-transform: uppercase;
  text-shadow:
    0 0 10px rgba(0,255,136,.6),
    0 0 25px rgba(0,255,136,.35);
  position: relative;
}

.results-title::after{
  content: "";
  display: block;
  width: 120px;
  height: 4px;
  margin: 14px auto 0;
  background: linear-gradient(90deg, transparent, #00ff88, transparent);
  border-radius: 10px;
}

@keyframes slideIn{
  from{transform:translateX(60px);opacity:0}
  to{transform:none;opacity:1}
}

@media(max-width:768px){
  .container{
    padding:0 6px;
  }

  .gurbani-wrapper{
    margin:20px 10px;
  }

  .results-grid{
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media(max-width:520px){
  .results-grid{
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce){
  *, *::before, *::after{
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
  @keyframes slideIn{
    from{transform:translateY(80px);opacity:0}
    to{transform:none;opacity:1}
  }
}
</style>
</head>

<body>
<div class="top-khanda left">☬</div>
<div class="top-khanda right">☬</div>

<div class="gurbani-wrapper">
  <img src="https://upload.wikimedia.org/wikipedia/commons/7/7f/Logo_of_sgpc.png?20220729000506" class="gurbani-logo" alt="SGPC Logo">

  <h2 class="gurbani-text">
    ਅਵਲਿ ਅਲਹ ਨੂਰੁ ਉਪਾਇਆ ਕੁਦਰਤਿ ਕੇ ਸਭ ਬੰਦੇ..<br>
    ਏਕ ਨੂਰ ਤੇ ਸਭੁ ਜਗੁ ਉਪਜਿਆ ਕਉਨ ਭਲੇ ਕੋ ਮੰਦੇ॥
  </h2>

  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQBECZ35JT_maSu_idWvUhCY7bwnT42ZUsipw&s" class="gurbani-logo" alt="SGGSWU Logo">
</div>

<div class="container">
  <div class="header">
    <h1 style="color:#FFD700;">☬ SGPC DivineScan ☬</h1>
  </div>

  <div class="upload-zone" id="uploadZone">
    <input type="file" id="fileInput" accept="image/*" hidden>
    <h2 id="fileStatus">Upload Image Here</h2>
    <button class="scan-btn" onclick="fileInput.click()">📸 Upload Image</button><br><br>
    <button class="scan-btn" id="scanBtn" onclick="scanGuru()" disabled>🔍 Scan Image</button>
  </div>

  <div class="preview-wrapper" id="previewWrapper">
    <div class="preview-inner" id="previewInner">
      <img id="previewImg" alt="Preview">
      <div id="loading" role="status" aria-live="polite">🔄 Scanning...</div>
      <div class="scan-overlay" id="scanOverlay">
        <div class="scan-line"></div>
      </div>
    </div>
  </div>

  <h2 id="resultsTitle" class="results-title"><b>Results are below</b></h2>

  <div class="results-section">
    <div style="text-align:center;margin-bottom:20px;">
      <button class="scan-btn" id="backBtn" style="display:none;">⬅ Back to Upload</button>
    </div>
    <div id="results" class="results-grid"></div>
  </div>


<script>

const fileInput = document.getElementById('fileInput');
const scanBtn = document.getElementById('scanBtn');
const uploadZone = document.getElementById('uploadZone');
const previewWrapper = document.getElementById('previewWrapper');
const previewInner = document.getElementById('previewInner');
const previewImg = document.getElementById('previewImg');
const scanOverlay = document.getElementById('scanOverlay');
const resultsDiv = document.getElementById('results');
const resultsTitle = document.getElementById('resultsTitle');
const backBtn = document.getElementById('backBtn');
const loadingDiv = document.getElementById('loading');

function showError(message){
  alert(message);
}

function resetToUploadView(){
  // reset UI back to initial upload state
  uploadZone.style.display = 'block';
  previewWrapper.style.display = 'none';
  scanOverlay.style.display = 'none';
  loadingDiv.style.display = 'none';
  fileInput.value = '';
  document.getElementById('fileStatus').textContent = 'Upload Image Here';
  scanBtn.disabled = true;
  backBtn.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

backBtn.addEventListener('click', resetToUploadView);

fileInput.addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;

  previewImg.src = URL.createObjectURL(file);
  document.getElementById('fileStatus').textContent = '✅ ' + file.name;
  scanBtn.disabled = false;

  previewImg.onload = function() {
    // overlay already uses inset:0 inside preview-inner
    scanOverlay.style.display = 'none';
  };
});

async function scanGuru(){
  const file = fileInput.files[0];
  if(!file) return;

  uploadZone.style.display='none';
  previewWrapper.style.display='flex';
  scanOverlay.style.display='block';
  backBtn.style.display='inline-block';

  loadingDiv.style.display='flex';
  resultsDiv.innerHTML='';

  scanOverlay.style.display='block';

  const formData = new FormData();
  formData.append('image', file);

  const apiCall = fetch('/guru-scan',{method:'POST',body:formData})
    .then(r=>r.json())
    .catch(()=>({ success:false, error:'Network error while scanning. Please try again.' }));
  const minDelay = new Promise(res=>setTimeout(res,4000));

  const [result] = await Promise.all([apiCall,minDelay]);

  scanOverlay.style.display='none';
  loadingDiv.style.display='none';
  resultsTitle.style.display = 'block';

  if(result && result.success){
    resultsDiv.innerHTML = result.results.map(r=>\`
      <div class="result-card">
        <img src="\${r.image}" style="width:100%;height:150px;object-fit:cover;border-radius:12px">
        <h3>\${r.title}</h3>
        <p><strong>Source:</strong> \${r.source}</p>
        <a href="\${r.link}" target="_blank"
          style="color:#FF6B6B;font-weight:bold;">
          🔗 Click here to open source
        </a>
      </div>
  \`).join('');

    console.log('✅ Scan complete. Total matches:', result.total_matches);
  } else {
    const msg = (result && result.error) ? result.error : 'Unable to scan this image right now. Please try again later.';
    showError(msg);
  }
}
</script>

<div class="bottom-khanda left">☬</div>
<div class="bottom-khanda right">☬</div>

</body>
</html>`);
});

// ✅ PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('🚀 SGPC Guru Scanner running on',PORT));


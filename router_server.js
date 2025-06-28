// server.js (Express App with Proxy Logic)
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');

const app = express();
const upload = multer({ dest: 'uploads/' });

const devices = ['10.0.0.62', '10.0.0.81']; // Add your Android node IPs here

app.use(express.static('public'));

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  let bestDevice = null;
  let maxFree = 0;

  for (const ip of devices) {
    try {
      const response = await axios.get(`http://${ip}:8000/stats`);
      if (response.data.free > maxFree) {
        maxFree = response.data.free;
        bestDevice = ip;
      }
    } catch (err) {
      console.log(`Failed to contact ${ip}`);
    }
  }

  if (!bestDevice) {
    return res.status(500).send('No devices available');
  }

  const options = {
    hostname: bestDevice,
    port: 8000,
    path: `/${encodeURIComponent(file.originalname || file.filename)}`,
    method: 'PUT',
    headers: {
      'Content-Length': fs.statSync(file.path).size
    }
  };

  const readStream = fs.createReadStream(file.path);
  const reqOut = http.request(options, (resp) => {
    resp.on('data', () => {});
    resp.on('end', () => {
      fs.unlinkSync(file.path);
      res.send(`Uploaded to ${bestDevice}`);
    });
  });

  readStream.pipe(reqOut);

  reqOut.on('error', (err) => {
    console.error(err);
    res.status(500).send('Upload failed');
  });
});

// Serve files.html
app.get('/files', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'files.html'));
});

// Proxy: Aggregate files from devices
app.get('/proxy/files', async (req, res) => {
  let allFiles = [];
  for (const ip of devices) {
    try {
      const response = await axios.get(`http://${ip}:8000/files.json`);
      const files = response.data.map(f => ({ ...f, ip }));
      allFiles = allFiles.concat(files);
    } catch (err) {
      console.error(`Failed to get files from ${ip}`, err.message);
    }
  }
  res.json(allFiles);
});

// Proxy: Aggregate storage stats
app.get('/proxy/stats', async (req, res) => {
  let total = 0, used = 0;
  for (const ip of devices) {
    try {
      const response = await axios.get(`http://${ip}:8000/stats`);
      total += response.data.total;
      used += response.data.used;
    } catch (err) {
      console.error(`Failed to get stats from ${ip}`, err.message);
    }
  }
  res.json({ total, used });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Unified uploader running at http://localhost:${PORT}`);
});

// server.js (Express App with Proxy Logic)
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');

const app = express();
const upload = multer({ dest: 'uploads/' });

const devices = ['10.0.0.62', '10.0.0.244', '10.0.0.93']; // Add your Android node IPs here

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


app.get('/proxy/file', async (req, res) => {
  const { ip, name } = req.query;
  try {
    const fileRes = await axios.get(`http://${ip}:8000/${encodeURIComponent(name)}`, {
      responseType: 'stream'
    });
    res.set(fileRes.headers); // Forward content-type and others
    fileRes.data.pipe(res);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Failed to load file');
  }
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

app.delete('/proxy/delete', async (req, res) => {
  const { ip, name } = req.query;
  try {
    const response = await axios.delete(`http://${ip}:8000/${encodeURIComponent(name)}`);
    res.status(response.status).send(response.data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Failed to delete file');
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Unified uploader running at http://localhost:${PORT}`);
});

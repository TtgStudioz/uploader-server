const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');

const app = express();
const upload = multer({ dest: 'uploads/' });

const devices = ['10.0.0.62', '10.0.0.81']; // All Android node IPs

app.use(express.static('public')); // index.html here

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  // Find device with most free space
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

  // Upload the file to the chosen device
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
      fs.unlinkSync(file.path); // Delete temp
      res.send(`Uploaded to ${bestDevice}`);
    });
  });

  readStream.pipe(reqOut);

  reqOut.on('error', (err) => {
    console.error(err);
    res.status(500).send('Upload failed');
  });
});

app.get('/files', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'files.html'));
});


app.listen(3000, () => {
  console.log('Unified upload site running at http://localhost:3000');
});

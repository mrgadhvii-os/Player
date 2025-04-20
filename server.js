import express from 'express';
import cors from 'cors';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { handleAppxVideo } from './appx.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('public'));

// Add cache control middleware
app.use((req, res, next) => {
    res.set('Cache-Control', 'public, max-age=31536000');
    next();
});

// Proxy endpoint for encrypted videos
app.get('/api/appx-video', async (req, res) => {
    try {
        const fullUrl = req.query.url;
        if (!fullUrl) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        // Split URL and key
        const [videoUrl, key] = fullUrl.split('*');
        if (!videoUrl || !key) {
            return res.status(400).json({ error: 'Invalid URL format. Expected format: URL*KEY' });
        }

        console.log('Processing encrypted video:', videoUrl);

        // Handle range request
        const range = req.headers.range;

        const { stream, contentType, contentLength, contentRange } = await handleAppxVideo(videoUrl, key, range);

        // Set performance-oriented headers
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }
        
        if (contentRange) {
            res.setHeader('Content-Range', contentRange);
            res.status(206); // Partial content
        }

        // Enable Keep-Alive
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=5, max=1000');

        // Pipe the decrypted stream to response with error handling
        stream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error occurred' });
            }
        });

        stream.pipe(res);

    } catch (error) {
        console.error('Encrypted video proxy error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process encrypted video' });
        }
    }
});

// Proxy endpoint for regular video URLs
app.get('/api/video-proxy', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const response = await fetch(videoUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch video');
        }

        // Forward the content type and other relevant headers
        response.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });

        // Pipe the video stream
        response.body.pipe(res);
    } catch (error) {
        console.error('Video proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

// Proxy endpoint for Classplus URLs
app.get('/api/classplus', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const apiUrl = `https://dragoapi.vercel.app/classplus?link=${videoUrl}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Classplus proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch video URL' });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 
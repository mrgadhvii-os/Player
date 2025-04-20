import fetch from 'node-fetch';
import { Transform } from 'stream';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks for faster initial load
const INITIAL_BYTES = 28; // Number of bytes to decrypt

class DecryptTransform extends Transform {
    constructor(key, startByte = 0) {
        super();
        this.key = key;
        this.startByte = startByte;
        this.bytesProcessed = 0;
        this.needsDecryption = startByte < INITIAL_BYTES;
    }

    _transform(chunk, encoding, callback) {
        try {
            const data = new Uint8Array(chunk);
            
            // Only decrypt if we're within the first 28 bytes of the file
            if (this.needsDecryption) {
                const startIndex = Math.max(0, this.startByte);
                const endIndex = Math.min(INITIAL_BYTES, startIndex + data.length);
                const decryptLength = endIndex - startIndex;

                if (decryptLength > 0) {
                    for (let i = 0; i < decryptLength; i++) {
                        const filePosition = startIndex + i;
                        if (filePosition < this.key.length) {
                            data[i] = data[i] ^ this.key.charCodeAt(filePosition);
                        } else {
                            data[i] = data[i] ^ filePosition;
                        }
                    }
                }
                this.needsDecryption = false;
            }

            this.push(Buffer.from(data));
            callback();
        } catch (error) {
            callback(error);
        }
    }
}

async function parseRange(rangeHeader) {
    if (!rangeHeader) return { start: 0, end: undefined };
    const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!matches) return { start: 0, end: undefined };
    return {
        start: parseInt(matches[1]),
        end: matches[2] ? parseInt(matches[2]) : undefined
    };
}

async function handleAppxVideo(url, key, range = null) {
    try {
        const { start, end } = await parseRange(range);
        const headers = {};

        // Add range header if specified
        if (range) {
            headers.Range = range;
        }

        // For seeking, we need to know if we're within the first 28 bytes
        const response = await fetch(url, { headers });
        
        if (!response.ok && response.status !== 206) {
            throw new Error('Failed to fetch encrypted video');
        }

        // Get content info
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');

        // Create transform stream with current position info
        const decryptStream = new DecryptTransform(key, start);

        // Set high water mark for better performance
        response.body.pipe(decryptStream, { highWaterMark: CHUNK_SIZE });

        return {
            stream: decryptStream,
            contentType: contentType || 'video/mp4',
            contentLength,
            contentRange
        };
    } catch (error) {
        console.error('Error processing encrypted video:', error);
        throw error;
    }
}

export { handleAppxVideo };
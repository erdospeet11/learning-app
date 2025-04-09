require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const PDFParser = require('pdf2json');

const app = express();
let uploadedPdfPath = null;
let pdfText = null;

// Configure multer for PDF uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, 'current.pdf')
    }
});
const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Create chapters directory if it doesn't exist
const chaptersDir = path.join(__dirname, 'chapters');
fs.mkdir(chaptersDir, { recursive: true }).catch(console.error);

// Configure Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: process.env.TEXT_MODEL_NAME_LATEST || 'gemini-pro'
});

// Configure Express
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.static(path.join(__dirname, 'templates')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/chapters', express.static(path.join(__dirname, 'chapters')));

// Function to extract text from PDF
async function extractTextFromPDF(pdfPath) {
    if (!pdfPath) return null;
    
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
            try {
                const text = pdfData.Pages
                    .map(page => page.Texts
                        .map(text => decodeURIComponent(text.R[0].T))
                        .join(' '))
                    .join('\n');
                resolve(text);
            } catch (error) {
                reject(error);
            }
        });
        
        pdfParser.on('pdfParser_dataError', reject);
        
        pdfParser.loadPDF(pdfPath);
    });
}

// Route for PDF upload
app.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        
        uploadedPdfPath = req.file.path;
        pdfText = await extractTextFromPDF(uploadedPdfPath);
        
        if (!pdfText) {
            return res.status(400).json({ error: 'Failed to extract text from PDF' });
        }
        
        res.json({ success: true, message: 'PDF uploaded and processed successfully' });
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// Helper functions for chapter management
async function getChapterList() {
    try {
        // Try to get chapters from text files first
        const textFileChapters = await getChaptersFromFiles();
        if (textFileChapters.length > 0) {
            return textFileChapters;
        }
        
        // Fall back to PDF extraction if no text files found
        if (!pdfText) return [];

        const chapters = [];
        const lines = pdfText.split('\n');
        
        for (const line of lines) {
            if (line.trim().toLowerCase().startsWith('chapter')) {
                chapters.push(line.trim());
            }
        }
        return chapters;
    } catch (error) {
        console.error('Error in getChapterList:', error);
        return [];
    }
}

async function getChaptersFromFiles() {
    try {
        const files = await fs.readdir(chaptersDir);
        
        const chapterFiles = files.filter(file => 
            file.match(/^chapter.*\.txt$/i)
        );
        
        return chapterFiles.map(file => {
            const match = file.match(/^chapter[_\-\s]*(\d+)[\-_\s]*(.*)\.txt$/i);
            if (match) {
                return `Chapter ${match[1]}${match[2] ? ': ' + match[2] : ''}`;
            }
            return file.replace(/\.txt$/i, '');
        });
    } catch (error) {
        console.error('Error reading chapters directory:', error);
        return [];
    }
}

async function getChapterContent(chapterNum) {
    try {
        // Try to get content from text file first
        const textFileContent = await getChapterFromFile(chapterNum);
        if (textFileContent) {
            return textFileContent;
        }
        
        // Fall back to PDF extraction if no text file found
        if (!pdfText) return 'No PDF content available';

        const lines = pdfText.split('\n');
        let currentChapter = 0;
        let content = [];
        let isCollecting = false;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.toLowerCase().startsWith('chapter')) {
                currentChapter++;
                if (currentChapter === chapterNum) {
                    isCollecting = true;
                    content.push(trimmedLine);
                } else if (currentChapter > chapterNum) {
                    break;
                }
            } else if (isCollecting && trimmedLine) {
                content.push(trimmedLine);
            }
        }

        return content.length > 0 ? content.join('\n\n') : 'Chapter content not found';
    } catch (error) {
        console.error('Error in getChapterContent:', error);
        return 'Error loading chapter content';
    }
}

async function getChapterFromFile(chapterNum) {
    try {
        const files = await fs.readdir(chaptersDir);
        
        // Look for a file that matches chapter number
        const chapterFile = files.find(file => {
            const match = file.match(/^chapter[_\-\s]*(\d+)/i);
            return match && parseInt(match[1]) === chapterNum;
        });
        
        if (chapterFile) {
            const rawContent = await fs.readFile(path.join(chaptersDir, chapterFile), 'utf8');
            // Apply some basic formatting
            return formatChapterContent(rawContent, chapterNum);
        }
        
        return null;
    } catch (error) {
        console.error('Error reading chapter file:', error);
        return null;
    }
}

function formatChapterContent(content, chapterNum) {
    if (!content) return '';
    
    // Split content into paragraphs
    const paragraphs = content.split(/\n\s*\n/);
    let formatted = '';
    
    // Process each paragraph
    paragraphs.forEach((paragraph, index) => {
        paragraph = paragraph.trim();
        if (!paragraph) return;
        
        // Check if this is a title (usually at the beginning and contains "Chapter" or similar)
        if (index === 0 && (paragraph.toLowerCase().includes('title:') || 
                           paragraph.toLowerCase().includes('chapter'))) {
            formatted += `<h1>${paragraph}</h1>\n\n<hr>\n\n`;
            return;
        }
        
        // Check for section headers with emphasis (starts with * and ends with *)
        if (paragraph.startsWith('*') && paragraph.endsWith('*') && paragraph.length < 100) {
            const cleanTitle = paragraph.substring(1, paragraph.length - 1).trim();
            formatted += `<h2 class="emphasized">${cleanTitle}</h2>\n\n`;
            return;
        }
        
        // Check for section headers (usually short, ends with colon or starts with specific words)
        if ((paragraph.endsWith(':') || /^(felépítése|működése|komponensek|példányok|rendszerállományok|memóriakezelés|rendszergazdai feladatok)/i.test(paragraph)) 
            && paragraph.length < 100) {
            formatted += `<h2>${paragraph}</h2>\n\n`;
            return;
        }
        
        // Check for lists (starts with -, *, •, or numbered)
        if (paragraph.split('\n').some(line => line.trim().match(/^[•*-]\s|^\d+\.\s/))) {
            const listItems = paragraph.split('\n').filter(line => line.trim());
            formatted += '<ul>\n';
            
            listItems.forEach(item => {
                // Strip the bullet or number
                const cleanItem = item.trim().replace(/^[•*-]\s*|\d+\.\s*/, '');
                formatted += `  <li>${formatTextContent(cleanItem)}</li>\n`;
            });
            
            formatted += '</ul>\n\n';
            return;
        }
        
        // Regular paragraph
        formatted += `<p>${formatTextContent(paragraph)}</p>\n\n`;
    });
    
    return formatted;
}

// Helper function to format text content with links and special formatting
function formatTextContent(text) {
    // Convert URLs to clickable links
    text = text.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Convert bold text (surrounded by **) - make sure not to process code
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert italic text (surrounded by *) - make sure not to process already bolded text
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert inline code (surrounded by `)
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    return text;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/chapters', async (req, res) => {
    try {
        const chapters = await getChapterList();
        res.json({ chapters });
    } catch (error) {
        console.error('Error getting chapter list:', error);
        res.status(500).json({ error: 'Failed to get chapter list' });
    }
});

app.get('/chapter/:number', async (req, res) => {
    try {
        const chapterNum = parseInt(req.params.number);
        const content = await getChapterContent(chapterNum);
        res.json({ content });
    } catch (error) {
        console.error('Error getting chapter content:', error);
        res.status(500).json({ error: 'Failed to get chapter content' });
    }
});

app.post('/ask', async (req, res) => {
    try {
        if (!req.body.question) {
            return res.status(400).json({ error: 'No question provided' });
        }

        let content = req.body.content;
        if (req.body.chapter) {
            content = await getChapterContent(req.body.chapter);
            if (content === 'Chapter content not found') {
                return res.status(404).json({ error: `Chapter ${req.body.chapter} not found` });
            }
        }

        const prompt = content ? 
            `${req.body.question}\n\nContent:\n${content}` : 
            req.body.question;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        res.json({
            success: true,
            response: text
        });
    } catch (error) {
        console.error('Error processing question:', error);
        res.status(500).json({ error: error.message });
    }
});

// New route to get the current PDF path
app.get('/pdf-path', async (req, res) => {
    // If a PDF has been uploaded, return its path
    if (uploadedPdfPath) {
        const relativePath = uploadedPdfPath.replace(path.join(__dirname, '/'), '');
        return res.json({ pdfPath: relativePath });
    }
    
    // Look for PDF files in the chapters folder
    try {
        const files = await fs.readdir(chaptersDir);
        const pdfFile = files.find(file => file.toLowerCase().endsWith('.pdf'));
        
        if (pdfFile) {
            return res.json({ pdfPath: `chapters/${pdfFile}` });
        }
        
        // No PDF found
        return res.status(404).json({ error: 'No PDF file has been uploaded or found in chapters directory' });
    } catch (error) {
        console.error('Error searching for PDFs:', error);
        return res.status(500).json({ error: 'Error searching for PDF files' });
    }
});

// New route to get a specific PDF from the chapters directory
app.get('/pdf/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(chaptersDir, filename);
    
    // Check if file exists
    fs.access(filePath)
        .then(() => {
            res.sendFile(filePath);
        })
        .catch(() => {
            res.status(404).json({ error: 'PDF file not found' });
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Upload PDFs using the web interface`);
}); 
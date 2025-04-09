let currentChapter = null;
let pdfUrl = null;
let availablePdfs = {
    uploaded: null,
    chapters: null
};

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-button[onclick="switchTab('${tabName}')"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // If switching to PDF tab, try to load the PDF
    if (tabName === 'pdf') {
        loadPdfViewer();
    }
}

function switchView(viewName) {
    // Update view toggle buttons
    document.querySelectorAll('.view-toggle button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.view-toggle button[onclick="switchView('${viewName}')"]`).classList.add('active');

    // Update view content
    document.getElementById('chat-messages').classList.toggle('active', viewName === 'chat');
    document.getElementById('chapter-viewer').classList.toggle('active', viewName === 'chapter');

    // Hide input area when in chapter view
    document.querySelector('.input-area').style.display = viewName === 'chat' ? 'flex' : 'none';
}

async function loadChapters() {
    try {
        const response = await fetch('/chapters');
        const data = await response.json();
        if (data.chapters && data.chapters.length > 0) {
            // Update the chapter list in the sidebar
            const chapterList = document.getElementById('chapter-list');
            
            // Extract chapter numbers for proper ordering and display
            const chapterItems = data.chapters.map((chapter, index) => {
                // Extract chapter number if present in the format "Chapter X:"
                const match = chapter.match(/Chapter\s+(\d+)/i);
                const chapterNum = match ? parseInt(match[1]) : (index + 1);
                
                // Create HTML with title truncation if needed
                return {
                    num: chapterNum,
                    html: `<li class="chapter-item" onclick="viewChapter(${chapterNum})" title="${chapter}">
                        <span class="chapter-number">Ch. ${chapterNum}</span>
                        <span class="chapter-title">${chapter}</span>
                    </li>`
                };
            });
            
            // Sort by chapter number
            chapterItems.sort((a, b) => a.num - b.num);
            
            // Update the HTML
            chapterList.innerHTML = chapterItems.map(item => item.html).join('');
            
            addMessage('Available chapters: ' + data.chapters.length, 'system');
        } else {
            addMessage('No chapters found. Please add chapter files to the chapters directory.', 'system');
        }
    } catch (error) {
        addMessage('Error loading chapters: ' + error, 'system');
    }
}

async function viewChapter(chapterNum) {
    try {
        const response = await fetch(`/chapter/${chapterNum}`);
        const data = await response.json();
        
        if (data.content) {
            // Update chapter viewer content
            const chapterViewer = document.getElementById('chapter-viewer');
            
            // Check if content is already HTML formatted (contains tags)
            if (data.content.includes('<h1>') || data.content.includes('<p>')) {
                // Content is already formatted HTML
                chapterViewer.innerHTML = `
                    <div class="chapter-content">
                        ${data.content}
                    </div>
                `;
            } else {
                // Format plain text content
                const formattedContent = data.content.split('\n\n').map(paragraph => 
                    `<p>${paragraph.trim()}</p>`
                ).join('');
                
                chapterViewer.innerHTML = `
                    <h1>Chapter ${chapterNum}</h1>
                    <div class="chapter-content">
                        ${formattedContent}
                    </div>
                `;
            }
            
            // Update active chapter in the list
            document.querySelectorAll('.chapter-item').forEach(item => {
                item.classList.remove('active');
            });
            const activeChapter = document.querySelector(`.chapter-item[onclick="viewChapter(${chapterNum})"]`);
            if (activeChapter) {
                activeChapter.classList.add('active');
            }
            
            // Switch to chapter view
            switchView('chapter');
            currentChapter = chapterNum;
        } else {
            addMessage('Error: Chapter content not found', 'system');
        }
    } catch (error) {
        console.error('Error loading chapter:', error);
        addMessage('Error loading chapter: ' + error, 'system');
    }
}

function formatChapterContent(content) {
    // Split content into paragraphs and format
    return content.split('\n\n').map(paragraph => 
        `<p>${paragraph.trim()}</p>`
    ).join('');
}

async function loadChapter(chapterNum) {
    try {
        const response = await fetch(`/chapter/${chapterNum}`);
        const data = await response.json();
        if (data.content) {
            currentChapter = chapterNum;
            addMessage(`Chapter ${chapterNum} loaded successfully!`, 'system');
            return data.content;
        }
    } catch (error) {
        addMessage('Error loading chapter: ' + error, 'system');
        return null;
    }
}

function addMessage(text, sender) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    // Check if the content appears to be HTML (for flashcards)
    if (text.includes('<div class="flashcards-container">')) {
        messageDiv.innerHTML = text;
    } else {
        // Apply Markdown-style formatting
        let formattedText = text
            // Process code blocks first (if any)
            .replace(/```([^`]+)```/g, '<pre>$1</pre>')
            // Process bold text - both ** and __ formats
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            // Process italic text - both * and _ formats 
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/_([^_]+)_/g, '<em>$1</em>')
            // Split into lines for paragraph and list processing
            .split('\n');
            
        // Process paragraphs, headers and lists
        formattedText = formattedText.map(line => {
            const trimmedLine = line.trim();
            
            // Check for headers (##, ###, etc.)
            if (trimmedLine.startsWith('#')) {
                const match = trimmedLine.match(/^(#+)\s*(.*)/);
                if (match) {
                    const level = Math.min(match[1].length, 6); // h1-h6 only
                    return `<h${level}>${match[2]}</h${level}>`;
                }
            }
            
            // Check for bullet points (•, *, -, or numbered lists)
            if (trimmedLine.match(/^[•*-]|\d+\./)) {
                return `<li>${trimmedLine.replace(/^[•*-]\s*|\d+\.\s*/, '')}</li>`;
            }
            
            // Regular paragraph
            if (trimmedLine.length > 0) {
                return `<p>${trimmedLine}</p>`;
            }
            
            // Empty line
            return '';
        }).join('');

        // Wrap bullet points in ul if they exist
        const hasListItems = formattedText.includes('<li>');
        messageDiv.innerHTML = hasListItems 
            ? `<ul class="formatted-list">${formattedText}</ul>`
            : formattedText;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    if (!message) return;

    // Add user message to chat
    addMessage(message, 'user');
    input.value = '';

    // Process command
    try {
        let response;
        if (message.startsWith('/')) {
            response = await processCommand(message);
        } else {
            response = await processQuestion(message);
        }
        addMessage(response, 'assistant');
    } catch (error) {
        addMessage('Error: ' + error, 'system');
    }
}

async function processCommand(command) {
    const parts = command.toLowerCase().split(' ');
    const cmd = parts[0];
    
    switch (cmd) {
        case '/help':
            return getHelpMessage();
        case '/list':
            await loadChapters();
            return '';
        case '/load':
            const chapterNum = parseInt(parts[1]);
            if (isNaN(chapterNum)) {
                return 'Please specify a chapter number (e.g., /load 1)';
            }
            const content = await loadChapter(chapterNum);
            return content ? 'Chapter loaded successfully!' : 'Failed to load chapter';
        case '/cards':
            if (!currentChapter) {
                return 'Please load a chapter first using /load <chapter_number>';
            }
            return await generateFlashcards(command, currentChapter);
        case '/summary':
            if (!currentChapter) {
                return 'Please load a chapter first using /load <chapter_number>';
            }
            return await generateSummary(currentChapter);
        case '/pdf':
            switchTab('pdf');
            return 'Opening PDF viewer...';
        case '/viewpdf':
            // Force the selection of chapters PDF
            document.getElementById('pdf-source-select').value = 'chapters';
            pdfUrl = null; // Reset to force reload
            switchTab('pdf');
            await loadPdfViewer();
            return 'Opening chapter PDF...';
        default:
            return `Unknown command: ${cmd}. Type /help to see available commands.`;
    }
}

async function processQuestion(question) {
    if (!currentChapter) {
        return 'Please load a chapter first using /load <chapter_number>';
    }

    const response = await fetch('/ask', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            question: question,
            chapter: currentChapter
        })
    });
    const data = await response.json();
    return data.response;
}

async function generateFlashcards(command, chapterNum) {
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                question: `Create 5 flashcards about Chapter ${chapterNum}. Format the response as JSON: {"cards":[{"question":"Q1","answer":"A1"},...]}.`,
                chapter: chapterNum
            })
        });
        
        const data = await response.json();
        let cards;
        
        try {
            cards = JSON.parse(data.response).cards;
        } catch (e) {
            console.error('Failed to parse JSON response:', e);
            return 'Error: Could not create flashcards. Please try again.';
        }
        
        let cardsHtml = '<div class="flashcards-container">';
        cards.forEach((card, index) => {
            cardsHtml += `
                <div class="flashcard">
                    <div class="flashcard-inner">
                        <div class="flashcard-front">
                            <div class="card-content">
                                <h3>Question ${index + 1}</h3>
                                <p>${card.question}</p>
                                <div class="flip-instruction">Click to flip</div>
                            </div>
                        </div>
                        <div class="flashcard-back">
                            <div class="card-content">
                                <h3>Answer</h3>
                                <p>${card.answer}</p>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        cardsHtml += '</div>';
        
        return cardsHtml;
    } catch (error) {
        console.error('Error generating flashcards:', error);
        return 'Error generating flashcards. Please try again.';
    }
}

async function generateSummary(chapterNum) {
    const response = await fetch('/ask', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            question: `Please provide a comprehensive summary of this chapter in bullet points. 
Use the following formatting:
- Use "## Main Topic" for section headers
- Use bullet points (•) for main points
- Use **bold** for important terms
- Use *italic* for emphasis
- Organize the summary into logical sections`,
            chapter: chapterNum
        })
    });
    const data = await response.json();
    return data.response;
}

function getHelpMessage() {
    return `
    Available commands:
    • <span class="command-code">/help</span> - Show this help message
    • <span class="command-code">/list</span> - List all available chapters
    • <span class="command-code">/load [number]</span> - Load a specific chapter
    • <span class="command-code">/cards</span> - Generate flashcards for the current chapter
    • <span class="command-code">/summary</span> - Generate a summary of the current chapter
    • <span class="command-code">/pdf</span> - Open the PDF viewer
    • <span class="command-code">/viewpdf</span> - Open the chapter PDF directly
    
    You can also ask questions about the content in natural language.
    `;
}

// Add event listener for Enter key
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Load chapters when the page loads
loadChapters();

async function uploadPDF(file) {
    const formData = new FormData();
    formData.append('pdf', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            handlePdfUploadResponse(true, 'PDF uploaded successfully!');
            addMessage('PDF uploaded successfully. You can now ask questions about the content.', 'system');
        } else {
            handlePdfUploadResponse(false, data.error || 'Failed to upload PDF');
            addMessage('Error uploading PDF: ' + (data.error || 'Unknown error'), 'system');
        }
    } catch (error) {
        handlePdfUploadResponse(false, 'Error: ' + error.message);
        addMessage('Error: ' + error.message, 'system');
    }
}

// Add drag and drop functionality
function setupDragAndDrop() {
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('pdf-upload');
    const uploadContainer = document.querySelector('.upload-container');
    
    // Handle form submission
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const files = fileInput.files;
        if (files.length > 0) {
            await uploadPDF(files[0]);
        } else {
            handlePdfUploadResponse(false, 'No file selected');
        }
    });
    
    // Setup drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadContainer.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadContainer.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadContainer.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        uploadContainer.classList.add('highlight');
    }
    
    function unhighlight() {
        uploadContainer.classList.remove('highlight');
    }
    
    uploadContainer.addEventListener('drop', handleDrop, false);
    
    async function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0 && files[0].type === 'application/pdf') {
            fileInput.files = files;
            await uploadPDF(files[0]);
        } else {
            handlePdfUploadResponse(false, 'Please upload a PDF file');
        }
    }
}

// Setup PDF control buttons
function setupPdfControls() {
    // This function would ideally use PDF.js to implement page navigation
    // For simplicity, we're just using the browser's built-in PDF viewer
    document.getElementById('prev-page').addEventListener('click', () => {
        const pdfEmbed = document.getElementById('pdf-embed');
        if (pdfEmbed.contentWindow) {
            pdfEmbed.contentWindow.postMessage({ action: 'previousPage' }, '*');
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        const pdfEmbed = document.getElementById('pdf-embed');
        if (pdfEmbed.contentWindow) {
            pdfEmbed.contentWindow.postMessage({ action: 'nextPage' }, '*');
        }
    });
    
    // Add event listener for the PDF selector
    document.getElementById('load-pdf-btn').addEventListener('click', () => {
        // Reset cached PDF URL to force reload
        pdfUrl = null;
        loadPdfViewer();
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initial loading of chapters
    loadChapters();
    
    // Setup drag and drop for PDF upload
    setupDragAndDrop();
    
    // Setup PDF controls
    setupPdfControls();
    
    // Check for available PDFs
    checkAvailablePdfs();
    
    // Add welcome message
    addMessage('Welcome to the Learning Assistant! Upload a PDF or explore available chapters.', 'system');
});

// Load PDF viewer with the current PDF
async function loadPdfViewer() {
    try {
        const pdfViewer = document.getElementById('pdf-viewer');
        const pdfEmbed = document.getElementById('pdf-embed');
        
        // Check available PDFs if we don't have them yet
        if (!availablePdfs.chapters && !availablePdfs.uploaded) {
            await checkAvailablePdfs();
        }
        
        // If no PDFs are available, show error
        if (!availablePdfs.chapters && !availablePdfs.uploaded) {
            pdfViewer.innerHTML = '<div class="pdf-error">No PDF file available. Please upload a PDF first.</div>';
            return;
        }
        
        // Choose which PDF to display based on dropdown
        const selectedSource = document.getElementById('pdf-source-select').value;
        
        // If the selected source has no PDF, try the other source
        if (!availablePdfs[selectedSource]) {
            const alternateSource = selectedSource === 'uploaded' ? 'chapters' : 'uploaded';
            if (availablePdfs[alternateSource]) {
                document.getElementById('pdf-source-select').value = alternateSource;
                pdfUrl = availablePdfs[alternateSource];
            } else {
                pdfViewer.innerHTML = '<div class="pdf-error">No PDF file available for the selected source.</div>';
                return;
            }
        } else {
            pdfUrl = availablePdfs[selectedSource];
        }
        
        // Set the PDF source in the iframe
        if (pdfUrl) {
            pdfEmbed.src = pdfUrl;
            
            // Make PDF viewer active
            pdfViewer.innerHTML = '';
            pdfViewer.appendChild(pdfEmbed);
            pdfViewer.classList.add('active');
        } else {
            pdfViewer.innerHTML = '<div class="pdf-error">Error loading PDF. Please try uploading again.</div>';
        }
        
    } catch (error) {
        console.error('Error loading PDF:', error);
        document.getElementById('pdf-viewer').innerHTML = `<div class="pdf-error">Error loading PDF: ${error.message}</div>`;
    }
}

// Check for available PDFs in both uploaded and chapters directories
async function checkAvailablePdfs() {
    try {
        // Check for uploaded PDF
        const response = await fetch('/pdf-path');
        
        if (response.ok) {
            const data = await response.json();
            if (data.pdfPath) {
                // Determine the source based on the path
                if (data.pdfPath.startsWith('chapters/')) {
                    availablePdfs.chapters = `/${data.pdfPath}`;
                } else {
                    availablePdfs.uploaded = `/${data.pdfPath}`;
                }
            }
        }
    } catch (error) {
        console.error('Error checking available PDFs:', error);
    }
}

// Function to handle PDF upload response
function handlePdfUploadResponse(success, message) {
    const uploadStatus = document.getElementById('upload-status');
    
    if (success) {
        uploadStatus.innerHTML = `<div class="success">${message}</div>`;
        // Reset the PDF URLs so we fetch the new ones next time
        availablePdfs.uploaded = null;
        // Switch to PDF view tab
        switchTab('pdf');
    } else {
        uploadStatus.innerHTML = `<div class="error">${message}</div>`;
    }
}

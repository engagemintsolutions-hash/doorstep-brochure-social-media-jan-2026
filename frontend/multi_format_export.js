/**
 * MULTI-FORMAT EXPORT SYSTEM
 *
 * Exports brochure in multiple formats simultaneously:
 * - PDF (original format)
 * - JPEG (optimized for web/email)
 * - PNG (high-quality images)
 * - Web HTML (responsive preview)
 * All packaged in a ZIP file
 *
 * Value: Covers all use cases instantly
 */

console.log('📦 Multi-Format Export loaded');

// Import JSZip library dynamically
let JSZip = null;

// Load JSZip from CDN
function loadJSZip() {
    return new Promise((resolve, reject) => {
        if (typeof window.JSZip !== 'undefined') {
            JSZip = window.JSZip;
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => {
            JSZip = window.JSZip;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ============================================
// MULTI-FORMAT EXPORT
// ============================================

/**
 * Main function to export brochure in multiple formats
 */
async function exportMultipleFormats() {
    try {
        // Show progress modal
        showExportProgressModal();

        // Ensure JSZip is loaded
        await loadJSZip();

        // Create ZIP file
        const zip = new JSZip();

        // Update progress
        updateExportProgress('Generating PDF...', 10);

        // 1. Export PDF (using existing system)
        const pdfBlob = await exportPDFBlob();
        if (pdfBlob) {
            zip.file('brochure.pdf', pdfBlob);
            updateExportProgress('PDF generated successfully', 30);
        }

        // 2. Generate page images (JPEG and PNG)
        updateExportProgress('Generating page images...', 40);
        const pages = window.brochureData?.pages || [];

        if (pages.length > 0) {
            const imagesFolder = zip.folder('images');

            for (let i = 0; i < Math.min(pages.length, 10); i++) {
                const page = pages[i];

                try {
                    // Generate JPEG (compressed, smaller file size)
                    const jpegBlob = await generatePageImage(page, 'jpeg', 0.85);
                    if (jpegBlob) {
                        imagesFolder.file(`page_${i + 1}.jpg`, jpegBlob);
                    }

                    // Generate PNG (high quality)
                    const pngBlob = await generatePageImage(page, 'png', 1.0);
                    if (pngBlob) {
                        imagesFolder.file(`page_${i + 1}.png`, pngBlob);
                    }

                    // Update progress
                    const progress = 40 + ((i + 1) / pages.length) * 40;
                    updateExportProgress(`Generated images for page ${i + 1}/${pages.length}`, progress);

                } catch (error) {
                    console.error(`Failed to generate images for page ${i + 1}:`, error);
                }
            }
        }

        // 3. Generate HTML preview
        updateExportProgress('Creating HTML preview...', 85);
        const htmlContent = generateHTMLPreview(pages);
        zip.file('preview.html', htmlContent);

        // 4. Add README
        const readme = generateReadme();
        zip.file('README.txt', readme);

        // Generate ZIP
        updateExportProgress('Packaging files...', 90);
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            const progress = 90 + (metadata.percent * 0.1);
            updateExportProgress(`Compressing... ${metadata.percent.toFixed(0)}%`, progress);
        });

        // Download ZIP
        updateExportProgress('Download ready!', 100);
        downloadBlob(zipBlob, 'brochure-multi-format.zip');

        // Close modal after short delay
        setTimeout(() => {
            closeExportProgressModal();
            if (typeof showToast === 'function') {
                showToast('success', '✓ Multi-format export complete!');
            }
        }, 1000);

    } catch (error) {
        console.error('Multi-format export failed:', error);
        closeExportProgressModal();

        if (typeof showToast === 'function') {
            showToast('error', `Export failed: ${error.message}`);
        }
    }
}

/**
 * Exports PDF and returns as Blob
 */
async function exportPDFBlob() {
    try {
        // Check if brochure data exists
        if (!window.brochureData || !window.brochureData.pages) {
            throw new Error('No brochure data available');
        }

        // Call backend API to generate PDF
        const response = await fetch('/api/export/brochure', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(window.brochureData)
        });

        if (!response.ok) {
            throw new Error(`PDF generation failed: ${response.statusText}`);
        }

        return await response.blob();

    } catch (error) {
        console.error('PDF export error:', error);
        // Return null to continue with other formats
        return null;
    }
}

/**
 * Generates an image of a single brochure page
 */
async function generatePageImage(page, format = 'jpeg', quality = 0.85) {
    return new Promise((resolve, reject) => {
        try {
            // Create canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas size (A4 aspect ratio at 300 DPI)
            const width = format === 'png' ? 2480 : 1240; // Higher res for PNG
            const height = format === 'png' ? 3508 : 1754;

            canvas.width = width;
            canvas.height = height;

            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Draw page content
            drawPageToCanvas(ctx, page, width, height);

            // Convert to blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create image blob'));
                    }
                },
                format === 'png' ? 'image/png' : 'image/jpeg',
                quality
            );

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Draws page content to canvas
 */
function drawPageToCanvas(ctx, page, width, height) {
    try {
        // Margins
        const margin = width * 0.1;
        const contentWidth = width - (margin * 2);
        const contentHeight = height - (margin * 2);

        // Page title
        ctx.fillStyle = '#2c3e50';
        ctx.font = `bold ${width * 0.04}px Arial, sans-serif`;
        ctx.fillText(page.name || 'Page', margin, margin + 40);

        // Draw photos
        let yOffset = margin + 80;
        const photos = page.contentBlocks?.filter(b => b.type === 'photo') || [];

        if (photos.length > 0) {
            const photoHeight = Math.min(contentHeight * 0.6, (contentWidth / photos.length) * 0.75);
            const photoWidth = contentWidth / Math.min(photos.length, 3);

            photos.slice(0, 3).forEach((photoBlock, index) => {
                const x = margin + (index * photoWidth);

                // Draw placeholder
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(x, yOffset, photoWidth - 10, photoHeight);

                // Try to load and draw actual photo
                const photoData = window.uploadedPhotos?.find(p =>
                    p.id === photoBlock.photoId || p.name === photoBlock.photoId
                );

                if (photoData && (photoData.dataUrl || photoData.url)) {
                    const img = new Image();
                    img.src = photoData.dataUrl || photoData.url;
                    img.onload = () => {
                        ctx.drawImage(img, x, yOffset, photoWidth - 10, photoHeight);
                    };
                }
            });

            yOffset += photoHeight + 40;
        }

        // Draw text content
        const textBlocks = page.contentBlocks?.filter(b => b.type !== 'photo') || [];
        ctx.fillStyle = '#4a5568';
        ctx.font = `${width * 0.02}px Arial, sans-serif`;

        textBlocks.forEach((block, index) => {
            if (yOffset > height - margin - 100) return; // Stop if running out of space

            ctx.fillStyle = '#2c3e50';
            ctx.font = `bold ${width * 0.025}px Arial, sans-serif`;
            ctx.fillText(block.title || block.type, margin, yOffset);

            yOffset += 30;

            ctx.fillStyle = '#4a5568';
            ctx.font = `${width * 0.02}px Arial, sans-serif`;

            // Wrap text
            const content = String(block.content || '').substring(0, 500);
            const lines = wrapText(ctx, content, contentWidth);

            lines.slice(0, 10).forEach(line => {
                ctx.fillText(line, margin, yOffset);
                yOffset += 25;
            });

            yOffset += 20;
        });

    } catch (error) {
        console.error('Error drawing page to canvas:', error);
    }
}

/**
 * Wraps text to fit within specified width
 */
function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        const testLine = currentLine + word + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine = testLine;
        }
    });

    if (currentLine) {
        lines.push(currentLine.trim());
    }

    return lines;
}

/**
 * Generates professional UK estate agent quality HTML brochure
 * Uses selected template colors, includes photos, follows estate agent format
 */
function generateHTMLPreview(pages) {
    // Get selected template and its styles
    const templateId = window.EditorState?.activeTemplate || 'savills_classic';
    const template = window.getTemplateById ? window.getTemplateById(templateId) : null;
    const styles = template?.styles || {
        pageBackground: '#FAF9F6',
        accentColor: '#722F37',  // Doorstep burgundy
        accentSecondary: '#F8F4E8',  // Doorstep cream
        textPrimary: '#2d2d2d',
        textSecondary: '#6b7280'
    };

    // Get property data
    const propertyData = window.brochureData?.property || {};
    const address = propertyData.address || 'Beautiful Property';
    const price = propertyData.price || 'Price on Application';
    const location = propertyData.location || '';
    const bedrooms = propertyData.bedrooms || '';
    const bathrooms = propertyData.bathrooms || '';
    const receptions = propertyData.receptions || '';
    const sqft = propertyData.sqft || '';
    const epc = propertyData.epc || '';
    const tenure = propertyData.tenure || 'Freehold';

    // Get photos with base64 data
    const photos = window.uploadedPhotos || window.UnifiedBrochureState?.photos || [];

    // Get content from pages
    const contentSections = extractContentSections(pages);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(address)} | ${escapeHtml(price)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: ${styles.accentColor};
            --secondary: ${styles.accentSecondary};
            --background: ${styles.pageBackground};
            --text-primary: ${styles.textPrimary};
            --text-secondary: ${styles.textSecondary};
            --burgundy: #722F37;
            --cream: #F8F4E8;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: var(--text-primary);
            line-height: 1.7;
            background: white;
        }

        /* Editable content styles */
        [contenteditable="true"] {
            outline: none;
            border-radius: 4px;
            transition: background 0.2s;
        }
        [contenteditable="true"]:hover {
            background: rgba(114, 47, 55, 0.05);
        }
        [contenteditable="true"]:focus {
            background: rgba(114, 47, 55, 0.1);
            box-shadow: 0 0 0 2px var(--burgundy);
        }

        /* Edit mode banner */
        .edit-banner {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: var(--burgundy);
            color: white;
            padding: 10px 20px;
            text-align: center;
            font-size: 0.9rem;
            z-index: 1000;
        }

        /* Cover section */
        .cover {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            margin-top: 40px;
        }
        .cover-header {
            background: var(--cream);
            padding: 20px 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo { height: 50px; width: auto; }
        .cover-hero {
            flex: 1;
            background: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.4)),
                        url("${photos[0]?.dataUrl || photos[0]?.url || ''}") center/cover no-repeat;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            padding: 60px;
            min-height: 70vh;
        }
        .cover-content { color: white; max-width: 700px; }
        .cover-content h1 {
            font-family: 'Playfair Display', serif;
            font-size: 3.2rem;
            font-weight: 400;
            margin-bottom: 15px;
            text-shadow: 2px 2px 8px rgba(0,0,0,0.5);
        }
        .cover-content .location {
            font-size: 1.4rem;
            font-weight: 300;
            margin-bottom: 25px;
            opacity: 0.95;
        }
        .cover-content .price {
            font-family: 'Playfair Display', serif;
            font-size: 2.8rem;
            font-weight: 500;
        }

        /* Features bar */
        .features-bar {
            background: var(--burgundy);
            color: white;
            padding: 25px 40px;
            display: flex;
            justify-content: center;
            gap: 40px;
            flex-wrap: wrap;
        }
        .feature-item { text-align: center; }
        .feature-item .value {
            font-family: 'Playfair Display', serif;
            font-size: 1.8rem;
            font-weight: 500;
        }
        .feature-item .label {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            opacity: 0.85;
            margin-top: 5px;
        }

        /* Main content */
        .content {
            max-width: 1100px;
            margin: 0 auto;
            padding: 60px 40px;
        }

        /* Opening paragraph */
        .opening {
            font-size: 1.2rem;
            font-style: italic;
            color: var(--text-primary);
            line-height: 1.9;
            padding: 30px 0;
            border-top: 1px solid var(--burgundy);
            border-bottom: 1px solid var(--burgundy);
            margin-bottom: 50px;
        }

        /* In Brief section */
        .in-brief {
            background: var(--cream);
            padding: 40px;
            margin-bottom: 50px;
            border-left: 5px solid var(--burgundy);
        }
        .in-brief h3 {
            font-family: 'Playfair Display', serif;
            color: var(--burgundy);
            font-size: 1.5rem;
            font-weight: 500;
            margin-bottom: 20px;
        }
        .in-brief ul {
            list-style: none;
            columns: 2;
            column-gap: 40px;
        }
        .in-brief li {
            padding: 10px 0;
            border-bottom: 1px solid rgba(114, 47, 55, 0.2);
            font-size: 0.95rem;
        }

        /* Content sections */
        .section { margin-bottom: 50px; }
        .section h2 {
            font-family: 'Playfair Display', serif;
            font-size: 1.8rem;
            font-weight: 400;
            color: var(--burgundy);
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--burgundy);
        }
        .section p {
            text-align: justify;
            font-weight: 300;
            font-size: 1.05rem;
            color: #444;
            white-space: pre-line;
        }

        /* Photo gallery */
        .gallery {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin: 50px 0;
        }
        .gallery img {
            width: 100%;
            height: 220px;
            object-fit: cover;
        }
        .gallery img:nth-child(1),
        .gallery img:nth-child(4) {
            grid-column: span 2;
            height: 280px;
        }

        /* Details grid */
        .details-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            background: var(--burgundy);
            color: white;
            margin: 50px 0;
        }
        .detail-box {
            padding: 30px 20px;
            text-align: center;
            border-right: 1px solid rgba(255,255,255,0.2);
        }
        .detail-box:last-child { border-right: none; }
        .detail-box .label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.8;
            margin-bottom: 8px;
        }
        .detail-box .value {
            font-family: 'Playfair Display', serif;
            font-size: 1.4rem;
            font-weight: 500;
        }

        /* Footer */
        .footer {
            background: var(--cream);
            padding: 40px;
            text-align: center;
        }
        .footer .agent-name {
            font-family: 'Playfair Display', serif;
            font-size: 1.5rem;
            color: var(--burgundy);
            margin-bottom: 10px;
        }
        .footer p {
            color: #666;
            font-size: 0.9rem;
            margin: 5px 0;
        }
        .footer .disclaimer {
            margin-top: 20px;
            font-size: 0.75rem;
            color: #999;
            max-width: 800px;
            margin-left: auto;
            margin-right: auto;
        }

        /* Print styles */
        @media print {
            body { background: white; }
            .edit-banner { display: none; }
            .cover { margin-top: 0; page-break-after: always; }
            [contenteditable="true"]:hover,
            [contenteditable="true"]:focus { background: transparent; box-shadow: none; }
        }

        /* Responsive */
        @media (max-width: 768px) {
            .cover-hero { padding: 30px; min-height: 50vh; }
            .cover-content h1 { font-size: 2rem; }
            .in-brief ul { columns: 1; }
            .gallery { grid-template-columns: 1fr 1fr; }
            .details-grid { grid-template-columns: repeat(3, 1fr); }
        }
    </style>
</head>
<body>
    <div class="edit-banner">EDIT MODE: Click any text to edit directly</div>

    <div class="cover">
        <header class="cover-header">
            <svg viewBox="0 0 200 100" class="logo">
                <path d="M60 70 L60 45 L50 45 L80 20 L110 45 L100 45 L100 70 Z" fill="#722F37"/>
                <rect x="70" y="50" width="20" height="20" fill="#F8F4E8"/>
                <text x="100" y="85" font-family="Georgia, serif" font-size="24" fill="#722F37">doorstep</text>
            </svg>
            <span style="color: var(--burgundy);">hello@doorstep.co.uk</span>
        </header>
        <div class="cover-hero">
            <div class="cover-content">
                <h1 contenteditable="true">${escapeHtml(address)}</h1>
                <p class="location" contenteditable="true">${escapeHtml(location)}</p>
                <p class="price" contenteditable="true">${escapeHtml(price)}</p>
            </div>
        </div>
    </div>

    ${bedrooms || bathrooms || receptions || sqft ? `
    <div class="features-bar">
        ${bedrooms ? `<div class="feature-item"><div class="value" contenteditable="true">${escapeHtml(bedrooms)}</div><div class="label">Bedrooms</div></div>` : ''}
        ${bathrooms ? `<div class="feature-item"><div class="value" contenteditable="true">${escapeHtml(bathrooms)}</div><div class="label">Bathrooms</div></div>` : ''}
        ${receptions ? `<div class="feature-item"><div class="value" contenteditable="true">${escapeHtml(receptions)}</div><div class="label">Receptions</div></div>` : ''}
        ${sqft ? `<div class="feature-item"><div class="value" contenteditable="true">${escapeHtml(sqft)}</div><div class="label">Sq Ft</div></div>` : ''}
        ${epc ? `<div class="feature-item"><div class="value" contenteditable="true">${escapeHtml(epc)}</div><div class="label">EPC</div></div>` : ''}
        <div class="feature-item"><div class="value" contenteditable="true">${escapeHtml(tenure)}</div><div class="label">Tenure</div></div>
    </div>
    ` : ''}

    <main class="content">
        ${contentSections.opening ? `
        <p class="opening" contenteditable="true">${escapeHtml(contentSections.opening)}</p>
        ` : ''}

        ${contentSections.highlights && contentSections.highlights.length > 0 ? `
        <div class="in-brief">
            <h3>In Brief</h3>
            <ul>
                ${contentSections.highlights.map(h => `<li contenteditable="true">${escapeHtml(h)}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        ${photos.length > 1 ? `
        <div class="gallery">
            ${photos.slice(1, 10).map((photo, i) => `
                <img src="${photo.dataUrl || photo.url || ''}" alt="${photo.caption || photo.name || `Photo ${i + 2}`}">
            `).join('')}
        </div>
        ` : ''}

        ${contentSections.situation ? `
        <section class="section">
            <h2>The Situation</h2>
            <p contenteditable="true">${escapeHtml(contentSections.situation)}</p>
        </section>
        ` : ''}

        ${contentSections.accommodation ? `
        <section class="section">
            <h2>The Accommodation</h2>
            <p contenteditable="true">${escapeHtml(contentSections.accommodation)}</p>
        </section>
        ` : ''}

        ${contentSections.outside ? `
        <section class="section">
            <h2>Outside</h2>
            <p contenteditable="true">${escapeHtml(contentSections.outside)}</p>
        </section>
        ` : ''}

        ${contentSections.services ? `
        <section class="section">
            <h2>Services</h2>
            <p contenteditable="true">${escapeHtml(contentSections.services)}</p>
        </section>
        ` : ''}

        ${generateAdditionalSections(contentSections)}

    </main>

    <footer class="footer">
        <svg viewBox="0 0 200 100" style="height: 60px; width: auto; margin-bottom: 10px;">
            <path d="M60 70 L60 45 L50 45 L80 20 L110 45 L100 45 L100 70 Z" fill="#722F37"/>
            <rect x="70" y="50" width="20" height="20" fill="#F8F4E8"/>
            <text x="100" y="85" font-family="Georgia, serif" font-size="24" fill="#722F37">doorstep</text>
        </svg>
        <p class="agent-name">Doorstep</p>
        <p>hello@doorstep.co.uk | 0800 123 4567</p>
        <p class="disclaimer" contenteditable="true">These particulars are intended to give a fair description of the property but their accuracy is not guaranteed and they do not constitute an offer or contract. None of the above appliances or services have been tested by the agent. All measurements are approximate.</p>
    </footer>
</body>
</html>`;

    return html;
}

/**
 * Extract content sections from brochure pages
 */
function extractContentSections(pages) {
    const sections = {
        opening: '',
        highlights: [],
        situation: '',
        accommodation: '',
        outside: '',
        services: '',
        additional: []
    };

    if (!pages || pages.length === 0) {
        return sections;
    }

    pages.forEach(page => {
        const pageName = (page.name || '').toLowerCase();
        const content = page.content || {};
        const blocks = page.contentBlocks || [];

        // Extract intro/opening
        if (content.intro) {
            sections.opening = content.intro;
        }

        // Extract highlights
        if (content.highlights && Array.isArray(content.highlights)) {
            sections.highlights = [...sections.highlights, ...content.highlights];
        }

        // Extract description based on page type
        const description = content.description || '';

        if (pageName.includes('location') || pageName.includes('situation')) {
            sections.situation = description || sections.situation;
        } else if (pageName.includes('living') || pageName.includes('reception') || pageName.includes('accommodation')) {
            sections.accommodation = sections.accommodation ?
                sections.accommodation + '\n\n' + description : description;
        } else if (pageName.includes('kitchen')) {
            sections.accommodation = sections.accommodation ?
                sections.accommodation + '\n\n' + description : description;
        } else if (pageName.includes('bedroom')) {
            sections.accommodation = sections.accommodation ?
                sections.accommodation + '\n\n' + description : description;
        } else if (pageName.includes('bathroom')) {
            sections.accommodation = sections.accommodation ?
                sections.accommodation + '\n\n' + description : description;
        } else if (pageName.includes('garden') || pageName.includes('outside') || pageName.includes('exterior')) {
            sections.outside = description || sections.outside;
        } else if (pageName.includes('contact') || pageName.includes('service')) {
            sections.services = description || sections.services;
        } else if (description) {
            sections.additional.push({
                title: page.name || 'Details',
                content: description
            });
        }

        // Also extract from content blocks
        blocks.forEach(block => {
            if (block.type !== 'photo' && block.content) {
                const blockTitle = (block.title || block.type || '').toLowerCase();
                if (blockTitle.includes('situation') || blockTitle.includes('location')) {
                    sections.situation = sections.situation || block.content;
                } else if (blockTitle.includes('accommodation')) {
                    sections.accommodation = sections.accommodation || block.content;
                } else if (blockTitle.includes('garden') || blockTitle.includes('outside')) {
                    sections.outside = sections.outside || block.content;
                } else if (blockTitle.includes('service')) {
                    sections.services = sections.services || block.content;
                } else if (blockTitle.includes('brief') || blockTitle.includes('highlight')) {
                    // Try to split into bullet points
                    const points = block.content.split(/[•\-\n]/).filter(p => p.trim());
                    sections.highlights = [...sections.highlights, ...points.map(p => p.trim())];
                }
            }
        });
    });

    // Deduplicate highlights
    sections.highlights = [...new Set(sections.highlights)].slice(0, 8);

    return sections;
}

/**
 * Generate additional content sections that don't fit standard categories
 */
function generateAdditionalSections(contentSections) {
    if (!contentSections.additional || contentSections.additional.length === 0) {
        return '';
    }

    return contentSections.additional.map(section => `
        <section class="section">
            <h2>${escapeHtml(section.title)}</h2>
            <p contenteditable="true">${escapeHtml(section.content)}</p>
        </section>
    `).join('');
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Generates README file content
 */
function generateReadme() {
    const timestamp = new Date().toLocaleString();

    return `PROPERTY BROCHURE - MULTI-FORMAT EXPORT
=====================================

Export Date: ${timestamp}

CONTENTS:
---------
1. brochure.pdf       - Full brochure in PDF format (print-ready)
2. images/            - Individual page images
   - page_*.jpg       - JPEG images (optimized for web/email)
   - page_*.png       - PNG images (high quality, lossless)
3. preview.html       - HTML preview (open in browser)

USAGE RECOMMENDATIONS:
---------------------
- PDF: Use for printing, official documents, and archiving
- JPEG: Use for website, social media, and email attachments
- PNG: Use when you need transparency or highest quality
- HTML: Use for web embedding or quick preview

SPECIFICATIONS:
--------------
- PDF: Vector format, print-ready
- JPEG: 1240x1754px, quality 85%
- PNG: 2480x3508px, lossless compression
- HTML: Responsive, print-friendly

Generated by Property Brochure Generator
For support, visit: https://doorstep.com/support
`;
}

/**
 * Downloads a blob as a file
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// PROGRESS MODAL
// ============================================

function showExportProgressModal() {
    const modal = document.createElement('div');
    modal.id = 'multiFormatExportModal';
    modal.className = 'multi-export-modal';
    modal.innerHTML = `
        <div class="multi-export-overlay"></div>
        <div class="multi-export-content">
            <div class="multi-export-header">
                <h3>📦 Exporting Multiple Formats</h3>
            </div>
            <div class="multi-export-body">
                <div class="export-progress-bar">
                    <div class="export-progress-fill" id="exportProgressFill"></div>
                </div>
                <p id="exportProgressText">Initializing export...</p>
                <div class="export-formats">
                    <div class="export-format">
                        <span class="format-icon">📄</span>
                        <span>PDF</span>
                    </div>
                    <div class="export-format">
                        <span class="format-icon">🖼️</span>
                        <span>JPEG</span>
                    </div>
                    <div class="export-format">
                        <span class="format-icon">🎨</span>
                        <span>PNG</span>
                    </div>
                    <div class="export-format">
                        <span class="format-icon">🌐</span>
                        <span>HTML</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function updateExportProgress(text, percentage) {
    const progressFill = document.getElementById('exportProgressFill');
    const progressText = document.getElementById('exportProgressText');

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    if (progressText) {
        progressText.textContent = text;
    }
}

function closeExportProgressModal() {
    const modal = document.getElementById('multiFormatExportModal');
    if (modal) {
        modal.remove();
    }
}

// ============================================
// GLOBAL EXPORTS
// ============================================

window.exportMultipleFormats = exportMultipleFormats;
window.generateHTMLPreview = generateHTMLPreview;
window.extractContentSections = extractContentSections;

console.log('✅ Multi-Format Export module ready');

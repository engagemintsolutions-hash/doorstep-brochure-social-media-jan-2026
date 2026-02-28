/**
 * Knight Frank Style Brochure Template
 * Professional 9-page estate agent brochure generator
 *
 * Replicates the exact layout and style of premium UK estate agent brochures
 */

const KnightFrankTemplate = (function() {
    'use strict';

    // Default brand colors (Doorstep - can be overridden)
    const DEFAULT_BRAND = {
        primary: '#4A1420',      // Doorstep burgundy
        secondary: '#f9f7f3',    // Doorstep ivory
        accent: '#4A1420',       // Accent for highlighted words
        text: '#3d3d3d',
        textLight: '#595959',
        background: '#ffffff',
        logoUrl: '/static/images/doorstep-logo.png'
    };

    // Font stacks
    const FONTS = {
        heading: "'Playfair Display', Georgia, 'Times New Roman', serif",
        body: "'Lora', Georgia, 'Times New Roman', serif"
    };

    /**
     * Generate complete Knight Frank style brochure HTML
     */
    function generate(data, options = {}) {
        const brand = { ...DEFAULT_BRAND, ...options.brand };
        const property = data.property || {};
        const photos = data.photos || [];
        const location = data.location || {};
        const agent = data.agent || {};
        brand.agentName = agent.officeName || agent.name || 'Doorstep';
        const floorPlan = data.floorPlan || null;
        const siteMap = data.siteMap || null;

        // Extract key data
        const address = property.address || 'Property Address';
        const price = formatPrice(property.askingPrice || property.price);
        const tagline = generateTagline(property, location);
        const roomSummary = generateRoomSummary(property);
        const situation = generateSituation(property, location);
        const propertyDescription = generatePropertyDescription(property, photos);
        const bedroomDescription = generateBedroomDescription(property, photos);
        const gardenDescription = generateGardenDescription(property, photos);

        // Categorize photos
        const categorizedPhotos = categorizePhotos(photos);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(address)} | ${escapeHtml(price)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <style>
        ${generateStyles(brand)}
    </style>
</head>
<body>
    <!-- Page 1: Cover -->
    ${generateCoverPage(address, price, property, categorizedPhotos, brand)}

    <!-- Page 2: Summary -->
    ${generateSummaryPage(address, tagline, roomSummary, property, location, agent, categorizedPhotos, brand)}

    <!-- Page 3: Location -->
    ${generateLocationPage(situation, categorizedPhotos, brand)}

    <!-- Page 4: Property Description -->
    ${generatePropertyPage(address, propertyDescription, categorizedPhotos, brand)}

    <!-- Page 5: Bedrooms -->
    ${generateBedroomsPage(bedroomDescription, categorizedPhotos, brand)}

    <!-- Page 6: Floor Plans -->
    ${generateFloorPlansPage(floorPlan, property, categorizedPhotos, brand)}

    <!-- Page 7: Gardens & Grounds -->
    ${generateGardensPage(gardenDescription, property, categorizedPhotos, brand)}

    <!-- Page 8: Technical Details -->
    ${generateDetailsPage(property, location, siteMap, categorizedPhotos, brand)}

    <!-- Page 9: Back Cover -->
    ${generateBackCoverPage(categorizedPhotos, agent, brand)}

    <script>
        // Enable contenteditable for all editable elements
        document.querySelectorAll('[data-editable]').forEach(el => {
            el.contentEditable = true;
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate CSS styles
     */
    function generateStyles(brand) {
        return `
        @page {
            size: A4 landscape;
            margin: 0;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: ${FONTS.body};
            color: ${brand.text};
            line-height: 1.6;
            background: #f5f5f5;
        }

        /* Editable elements */
        [data-editable]:hover {
            outline: 2px dashed ${brand.primary}40;
            outline-offset: 2px;
        }
        [data-editable]:focus {
            outline: 2px solid ${brand.primary};
            outline-offset: 2px;
            background: ${brand.primary}08;
        }

        /* Page structure */
        .brochure-page {
            width: 297mm;
            height: 210mm;
            background: ${brand.background};
            margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            position: relative;
            overflow: hidden;
            page-break-after: always;
        }
        /* Prevent grid children from overflowing their cells */
        .brochure-page > *:not(.page-footer) {
            overflow: hidden;
            min-width: 0;
            min-height: 0;
        }

        /* Cover page */
        .cover-page {
            position: relative;
        }
        .cover-page .hero-image {
            width: 100%;
            height: 210mm;
            object-fit: cover;
        }
        .cover-page .overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.75) 100%);
            padding: 60px 50px 40px;
        }
        .cover-page .cover-content {
            text-align: left;
            background: rgba(0,0,0,0.15);
            padding: 20px 30px;
            border-radius: 8px;
            backdrop-filter: blur(2px);
            display: inline-block;
        }
        .cover-page .property-name {
            font-family: ${FONTS.heading};
            font-size: 38px;
            font-weight: 400;
            color: white;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .cover-page .cover-price {
            font-family: ${FONTS.heading};
            font-size: 28px;
            font-weight: 500;
            color: white;
            margin-bottom: 15px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .cover-page .cover-stats {
            display: flex;
            gap: 25px;
            margin-top: 10px;
        }
        .cover-page .cover-stats .stat {
            color: white;
            font-size: 14px;
            text-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .cover-page .cover-stats .stat strong {
            font-size: 18px;
            font-weight: 600;
            margin-right: 5px;
        }
        .cover-page .logo {
            position: absolute;
            top: 25px;
            right: 30px;
        }
        .cover-page .logo img {
            display: block;
        }

        /* Summary page - split layout */
        .summary-page {
            display: grid;
            grid-template-columns: 1fr 1fr;
        }
        .summary-page .image-section {
            position: relative;
            overflow: hidden;
        }
        .summary-page .image-section img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .summary-page .image-section .caption {
            position: absolute;
            bottom: 20px;
            left: 20px;
            color: white;
            font-size: 12px;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        .summary-page .content-section {
            padding: 50px 45px;
            display: flex;
            flex-direction: column;
        }
        .summary-page .tagline {
            font-family: ${FONTS.heading};
            font-size: 22px;
            font-weight: 400;
            line-height: 1.4;
            color: ${brand.text};
            margin-bottom: 20px;
        }
        .summary-page .tagline .accent {
            color: ${brand.accent};
            font-weight: 500;
        }

        /* At a Glance Box */
        .summary-page .at-glance-box {
            background: #f5f1e8;
            padding: 20px 25px;
            margin-bottom: 20px;
            border-left: 4px solid ${brand.primary};
        }
        .summary-page .at-glance-box h3 {
            font-family: ${FONTS.heading};
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            color: ${brand.primary};
        }
        .summary-page .at-glance-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 15px;
        }
        .summary-page .glance-item {
            text-align: center;
        }
        .summary-page .glance-value {
            display: block;
            font-family: ${FONTS.heading};
            font-size: 24px;
            font-weight: 600;
            color: ${brand.primary};
        }
        .summary-page .glance-label {
            display: block;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: ${brand.textLight};
            margin-top: 3px;
        }
        .summary-page .price-display {
            text-align: center;
            padding-top: 15px;
            border-top: 1px solid ${brand.primary}30;
        }
        .summary-page .price-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: ${brand.textLight};
        }
        .summary-page .price-value {
            display: block;
            font-family: ${FONTS.heading};
            font-size: 28px;
            font-weight: 600;
            color: ${brand.primary};
            margin-top: 5px;
        }

        .summary-page .divider {
            width: 100%;
            height: 1px;
            background: ${brand.text}30;
            margin-bottom: 20px;
        }
        .summary-page h3 {
            font-family: ${FONTS.heading};
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 10px;
            color: ${brand.text};
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .summary-page .room-list {
            font-size: 13px;
            line-height: 1.6;
            color: ${brand.textLight};
            margin-bottom: 20px;
        }
        .summary-page .total-size {
            font-size: 13px;
            font-weight: 500;
            color: ${brand.text};
            margin-bottom: 30px;
        }
        .summary-page .distances h3 {
            margin-bottom: 8px;
        }
        .summary-page .distances p {
            font-size: 12px;
            color: ${brand.textLight};
            margin-bottom: 5px;
        }
        .summary-page .distances .note {
            font-size: 11px;
            font-style: italic;
            color: #999;
        }
        .summary-page .agent-section {
            margin-top: auto;
            display: grid;
            grid-template-columns: auto 1fr 1fr;
            gap: 30px;
            align-items: start;
            padding-top: 30px;
            border-top: 1px solid #eee;
        }
        .summary-page .agent-section .logo {
            color: ${brand.primary};
        }
        .summary-page .agent-office h4 {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 5px;
        }
        .summary-page .agent-office p {
            font-size: 11px;
            color: ${brand.textLight};
            line-height: 1.5;
        }
        .summary-page .agent-office a {
            color: ${brand.primary};
            text-decoration: none;
        }
        .summary-page .agent-name {
            font-weight: 600;
            color: ${brand.text};
            margin-top: 10px;
        }

        /* Location page - full-width hero photo with text below */
        .location-page {
            display: grid;
            grid-template-columns: 1fr;
            grid-template-rows: 0.45fr 0.55fr;
            gap: 0;
        }
        .location-page .location-hero {
            overflow: hidden;
            position: relative;
        }
        .location-page .location-hero img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .location-page .location-hero .photo-caption {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 6px 15px;
            background: rgba(0,0,0,0.45);
            color: white;
            font-size: 11px;
        }
        .location-page .text-section {
            padding: 30px 50px;
            background: ${brand.background};
        }
        .location-page h2 {
            font-family: ${FONTS.heading};
            font-size: 26px;
            font-weight: 500;
            margin-bottom: 20px;
            padding-left: 15px;
            border-left: 4px solid ${brand.primary};
            color: ${brand.text};
        }
        .location-page .text-content {
            font-size: 13px;
            line-height: 1.6;
            color: #333333;
            text-align: justify;
            column-count: 2;
            column-gap: 30px;
        }
        .location-page .text-content p {
            margin-bottom: 10px;
        }

        /* Property description page */
        .property-page {
            display: grid;
            grid-template-columns: 1.2fr 1fr 0.8fr;
            gap: 0;
        }
        .property-page .main-image {
            overflow: hidden;
        }
        .property-page .main-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .property-page .text-section {
            padding: 40px 35px;
        }
        .property-page h2 {
            font-family: ${FONTS.heading};
            font-size: 22px;
            font-weight: 400;
            margin-bottom: 20px;
            color: ${brand.text};
        }
        .property-page .description {
            font-size: 12px;
            line-height: 1.55;
            color: #333333;
            text-align: justify;
            overflow: hidden;
        }
        .property-page .description p {
            margin-bottom: 12px;
        }
        .property-page .side-photos {
            display: grid;
            grid-template-rows: 1fr 1fr;
            gap: 3px;
        }
        .property-page .side-photos .photo-container,
        .property-page .side-photos img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Bedrooms page */
        /* Bedrooms page - 2 column: photos left, text right */
        .bedrooms-page-v2 {
            display: grid;
            grid-template-columns: 1fr 1.2fr;
            gap: 0;
        }
        .bedrooms-page-v2 .bedroom-photos {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 3px;
        }
        .bedrooms-page-v2 .bedroom-photos.photos-2 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
        }
        .bedrooms-page-v2 .bedroom-photos.photos-1 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr;
        }
        .bedrooms-page-v2 .bedroom-photos .photo-container,
        .bedrooms-page-v2 .bedroom-photos img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .bedrooms-page-v2 .bedroom-text {
            padding: 50px 40px;
            background: ${brand.background};
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .bedrooms-page-v2 .bedroom-text h2 {
            font-family: ${FONTS.heading};
            font-size: 26px;
            font-weight: 500;
            margin-bottom: 25px;
            padding-left: 15px;
            border-left: 4px solid ${brand.primary};
            color: ${brand.text};
        }
        .bedrooms-page-v2 .text-content {
            font-size: 14px;
            line-height: 1.6;
            color: #333333;
        }
        .bedrooms-page-v2 .text-content p {
            margin-bottom: 12px;
        }

        /* Floor plans page */
        .floorplans-page {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
        }
        .floorplans-page .plans-section {
            padding: 30px 40px;
            background: ${brand.background};
        }
        .floorplans-page .area-info {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 5px;
        }
        .floorplans-page .area-detail {
            font-size: 12px;
            color: ${brand.textLight};
            margin-bottom: 20px;
        }
        .floorplans-page .disclaimer {
            font-size: 10px;
            color: #999;
            margin-bottom: 20px;
            line-height: 1.5;
        }
        .floorplans-page .plan-image {
            max-width: 100%;
            margin-bottom: 20px;
        }
        .floorplans-page .legend {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            font-size: 11px;
        }
        .floorplans-page .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .floorplans-page .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
        }
        .floorplans-page .photos-section {
            display: grid;
            grid-template-rows: 1fr 1fr;
            gap: 3px;
        }
        .floorplans-page .photos-section img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Photo spread (no floor plan fallback) */
        .photo-spread-page {
            display: grid !important;
            grid-template-columns: 1.4fr 1fr !important;
            gap: 0;
        }
        .photo-spread-page .spread-hero {
            overflow: hidden;
        }
        .photo-spread-page .spread-hero .photo-container,
        .photo-spread-page .spread-hero img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .photo-spread-page .spread-sidebar {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .photo-spread-page .spread-sidebar h2 {
            font-family: ${FONTS.heading};
            font-size: 20px;
            font-weight: 500;
            padding: 12px 20px 8px;
            margin: 0;
            border-left: 4px solid ${brand.primary};
            margin-left: 15px;
            color: ${brand.text};
            flex-shrink: 0;
        }
        .photo-spread-page .spread-sidebar-text {
            font-family: ${FONTS.body};
            font-size: 11.5px;
            line-height: 1.6;
            color: #555;
            padding: 6px 20px 10px 35px;
            flex-shrink: 0;
        }
        .photo-spread-page .spread-sidebar-text p {
            margin: 0;
        }
        .photo-spread-page .spread-sidebar .photo-container {
            flex: 1;
            overflow: hidden;
        }
        .photo-spread-page .spread-sidebar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Gardens page */
        .gardens-page {
            display: grid;
            grid-template-columns: 1fr 1.5fr;
            gap: 0;
        }
        .gardens-page .text-section {
            padding: 40px;
            background: ${brand.background};
        }
        .gardens-page h2 {
            font-family: ${FONTS.heading};
            font-size: 20px;
            font-weight: 400;
            margin-bottom: 20px;
            color: ${brand.text};
        }
        .gardens-page .description {
            font-size: 13px;
            line-height: 1.6;
            color: #333333;
            text-align: justify;
            margin-bottom: 20px;
        }
        .gardens-page .outbuilding-info {
            font-size: 11px;
            color: ${brand.textLight};
            padding: 15px;
            background: #f9f9f9;
            border-left: 3px solid ${brand.primary};
        }
        .gardens-page .photo-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1.2fr 0.8fr;
            gap: 3px;
        }
        .gardens-page .photo-grid .photo-container,
        .gardens-page .photo-grid img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .gardens-page .photo-grid > :first-child {
            grid-column: span 2;
        }

        /* Details page */
        .details-page {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 0;
        }
        .details-page.no-map {
            grid-template-columns: 1.2fr 1fr;
        }
        .details-page .map-section {
            padding: 30px;
            background: #f9f9f9;
        }
        .details-page .map-section img {
            width: 100%;
            margin-bottom: 15px;
            border: 1px solid #ddd;
        }
        .details-page .map-note {
            font-size: 9px;
            color: #999;
            line-height: 1.4;
        }
        .details-page .info-section {
            padding: 40px 35px;
            background: ${brand.background};
        }
        .details-page h3 {
            font-family: ${FONTS.heading};
            font-size: 16px;
            font-weight: 400;
            margin-bottom: 10px;
            color: ${brand.text};
        }
        .details-page .info-content {
            font-size: 12px;
            color: ${brand.textLight};
            margin-bottom: 25px;
            line-height: 1.6;
        }
        .details-page .info-table {
            margin-bottom: 25px;
        }
        .details-page .info-row {
            display: flex;
            font-size: 12px;
            padding: 5px 0;
        }
        .details-page .info-label {
            font-weight: 500;
            color: ${brand.text};
            width: 120px;
        }
        .details-page .info-value {
            color: ${brand.textLight};
        }
        .details-page .legal-section {
            font-size: 8px;
            color: #999;
            line-height: 1.4;
            margin-top: auto;
        }
        .details-page .info-divider {
            height: 1px;
            background: ${brand.primary}30;
            margin: 12px 0;
        }
        .details-page .info-section h3 {
            padding-left: 10px;
            border-left: 3px solid ${brand.primary};
        }
        .details-page .doorstep-footer-logo {
            margin-top: 15px;
            text-align: center;
            opacity: 0.4;
        }
        .details-page .doorstep-footer-logo img {
            height: 20px;
            width: auto;
        }
        .details-page .photo-column {
            display: grid;
            grid-template-rows: 1fr 1fr;
            gap: 3px;
        }
        .details-page .photo-column img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Back cover */
        .back-cover {
            position: relative;
        }
        .back-cover img {
            width: 100%;
            height: 210mm;
            object-fit: cover;
            filter: brightness(0.7);
        }
        .back-cover .back-cover-content {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 40px 60px;
            background: rgba(74, 20, 32, 0.92);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .back-cover .logo-large {
            background: rgba(255,255,255,0.95);
            padding: 8px 12px;
            border-radius: 3px;
            display: inline-block;
        }
        .back-cover .logo-large img {
            display: block;
        }
        .back-cover .logo-large svg {
            height: 70px;
            width: auto;
        }
        .back-cover .contact-info {
            text-align: right;
        }
        .back-cover .contact-info p {
            font-size: 18px;
            margin-bottom: 8px;
            color: white;
        }
        .back-cover .contact-info .office {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        .back-cover .contact-info a {
            color: white;
            text-decoration: none;
        }

        /* Photo containers with captions */
        .photo-container {
            position: relative;
            overflow: hidden;
        }
        .photo-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .photo-caption {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 6px 12px;
            background: rgba(0,0,0,0.5);
            color: white;
            font-size: 11px;
            font-family: ${FONTS.body};
        }
        .photo-caption:empty {
            display: none;
        }

        /* Page footer with page numbers */
        .page-footer {
            position: absolute;
            bottom: 5mm;
            left: 15mm;
            right: 15mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0 0 0;
            border-top: 1px solid ${brand.primary}33;
            z-index: 50;
            background: white;
        }
        .page-footer .footer-agent {
            font-family: ${FONTS.body};
            font-size: 8px;
            color: ${brand.textLight};
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .page-footer .footer-page-num {
            font-family: ${FONTS.body};
            font-size: 9px;
            color: ${brand.textLight};
        }

        /* Print styles */
        @media print {
            body {
                background: white;
            }
            .brochure-page {
                margin: 0;
                box-shadow: none;
                page-break-after: always;
            }
            [data-editable]:hover,
            [data-editable]:focus {
                outline: none;
                background: transparent;
            }
        }
        `;
    }

    /**
     * Generate page footer with accent line and page number
     */
    function generatePageFooter(pageNum, brand) {
        return `<div class="page-footer">
            <span class="footer-agent">${escapeHtml(brand.agentName || 'Doorstep')}</span>
            <span class="footer-page-num">${pageNum}</span>
        </div>`;
    }

    /**
     * Generate Cover Page (Page 1)
     */
    function generateCoverPage(address, price, property, photos, brand) {
        // Cover hero: strongly prefer outdoor shots — exterior, aerial, garden, view — never interior/bathroom
        const heroPhoto = photos.exterior?.[0] || photos.aerial?.[0] || photos.garden?.[0] || photos.view?.[0] || photos.all?.[0];
        const heroUrl = heroPhoto?.url || heroPhoto?.dataUrl || '';

        // Build key stats for cover
        const beds = property.bedrooms || '';
        const baths = property.bathrooms || '';
        const receptions = property.receptions || '';
        const sqft = property.sqft ? `${Number(property.sqft).toLocaleString()} sq ft` : '';

        return `
        <div class="brochure-page cover-page">
            <img src="${heroUrl}" alt="Property exterior" class="hero-image">
            <div class="overlay">
                <div class="cover-content">
                    <h1 class="property-name" data-editable="address">${escapeHtml(address)}</h1>
                    <div class="cover-price" data-editable="price">Guide Price ${price}</div>
                    <div class="cover-stats">
                        ${beds ? `<span class="stat"><strong>${beds}</strong> Bedrooms</span>` : ''}
                        ${baths ? `<span class="stat"><strong>${baths}</strong> Bathrooms</span>` : ''}
                        ${receptions ? `<span class="stat"><strong>${receptions}</strong> Reception Rooms</span>` : ''}
                        ${sqft ? `<span class="stat"><strong>${sqft}</strong></span>` : ''}
                    </div>
                </div>
            </div>
            <div class="logo"><img src="${brand.logoWhiteUrl || '/static/images/doorstep-logo-white.png'}" alt="Doorstep" style="height: 36px;"></div>
        </div>`;
    }

    /**
     * Generate Summary Page (Page 2)
     */
    function generateSummaryPage(address, tagline, roomSummary, property, location, agent, photos, brand) {
        const viewPhoto = photos.living?.[0] || photos.view?.[0] || photos.exterior?.[1] || photos.all?.[1];
        const viewUrl = viewPhoto?.url || viewPhoto?.dataUrl || '';

        const distances = generateDistances(location);
        const price = formatPrice(property.askingPrice || property.price);

        // Generate At-a-Glance box
        const atGlance = generateAtGlance(property);

        return `
        <div class="brochure-page summary-page">
            <div class="image-section">
                <img src="${viewUrl}" alt="View from the property">
            </div>
            <div class="content-section">
                <p class="tagline" data-editable="tagline">${tagline}</p>

                <!-- At a Glance Box -->
                <div class="at-glance-box">
                    <h3>At a Glance</h3>
                    <div class="at-glance-grid">
                        ${atGlance}
                    </div>
                    <div class="price-display">
                        <span class="price-label">Guide Price</span>
                        <span class="price-value" data-editable="price">${price}</span>
                    </div>
                </div>

                <div class="divider"></div>

                <h3>Summary of Accommodation</h3>
                <div class="room-list" data-editable="rooms">${roomSummary}</div>

                <div class="distances">
                    <h3>Distances</h3>
                    ${distances}
                    <p class="note">(All distances and times are approximate)</p>
                </div>

                <div class="agent-section">
                    <div class="logo"><img src="${brand.logoUrl || '/static/images/doorstep-logo.png'}" alt="Doorstep" style="height: 35px;"></div>
                    <div class="agent-office">
                        <h4>${agent.officeName || 'Doorstep'}</h4>
                        <p>${agent.address || ''}</p>
                        <p><a href="${agent.website || 'https://doorstep.co.uk'}">${agent.website || 'doorstep.co.uk'}</a></p>
                        <p class="agent-name">${agent.name || ''}</p>
                        <p>${agent.phone || ''}</p>
                        <p>${agent.email || ''}</p>
                    </div>
                </div>
            </div>
            ${generatePageFooter(2, brand)}
        </div>`;
    }

    /**
     * Generate Location Page (Page 3) - renamed from "Situation"
     */
    function generateLocationPage(situation, photos, brand) {
        // Use the best exterior/aerial photo as the hero
        const heroPhoto = photos.exterior?.[0] || photos.aerial?.[0] || photos.garden?.[0];

        return `
        <div class="brochure-page location-page">
            <div class="location-hero">
                <img src="${heroPhoto?.url || heroPhoto?.dataUrl || ''}" alt="Location">
                <span class="photo-caption">${escapeHtml(formatCaption(heroPhoto || {}))}</span>
            </div>
            <div class="text-section">
                <h2>Location</h2>
                <div class="text-content" data-editable="location">
                    ${situation}
                </div>
            </div>
            ${generatePageFooter(3, brand)}
        </div>`;
    }

    /**
     * Generate Property Description Page (Page 4)
     */
    function generatePropertyPage(address, description, photos, brand) {
        const mainPhoto = photos.kitchen?.[0] || photos.living?.[0] || photos.interior?.[0] || photos.all?.[1];
        // Build side photos from available interior shots (including luxury features), excluding the main photo
        const candidates = [
            photos.living?.[0], photos.living?.[1], photos.reception?.[0],
            photos.dining?.[0], photos.orangery?.[0], photos.library?.[0],
            photos.cinema?.[0], photos.gym?.[0], photos.wine_cellar?.[0],
            photos.games?.[0], photos.spa?.[0],
            photos.interior?.[0], photos.interior?.[1],
            photos.bedroom?.[0], photos.bathroom?.[0],
            photos.all?.[2], photos.all?.[3]
        ].filter(p => p && p !== mainPhoto);
        // Deduplicate by id
        const seen = new Set();
        const sidePhotos = [];
        for (const p of candidates) {
            if (!seen.has(p.id || p.name)) {
                seen.add(p.id || p.name);
                sidePhotos.push(p);
                if (sidePhotos.length >= 2) break;
            }
        }

        const propertyName = address.split(',')[0] || address;

        return `
        <div class="brochure-page property-page">
            <div class="main-image photo-container">
                <img src="${mainPhoto?.url || mainPhoto?.dataUrl || ''}" alt="Kitchen">
                <span class="photo-caption">${escapeHtml(formatCaption(mainPhoto || {}))}</span>
            </div>
            <div class="text-section">
                <h2 data-editable="property-name">${escapeHtml(propertyName)}</h2>
                <div class="description" data-editable="property-description">
                    ${description}
                </div>
            </div>
            <div class="side-photos">
                ${sidePhotos.map((photo, i) => `
                    <div class="photo-container">
                        <img src="${photo?.url || photo?.dataUrl || ''}" alt="Interior ${i + 1}">
                        <span class="photo-caption">${escapeHtml(formatCaption(photo))}</span>
                    </div>
                `).join('')}
            </div>
            ${generatePageFooter(4, brand)}
        </div>`;
    }

    /**
     * Generate Bedrooms Page (Page 5) - adaptive layout based on photos available
     */
    function generateBedroomsPage(description, photos, brand) {
        // Fill up to 4 photos: bedrooms first, then bathrooms only (no living/interior fallbacks — avoid irrelevant photos)
        const bedroomPhotos = [
            ...(photos.bedroom || []),
            ...(photos.bathroom || [])
        ].slice(0, 4);

        // 2-column layout: text left, photos right (flipped from page 4 for variety)
        return `
        <div class="brochure-page bedrooms-page-v2">
            <div class="bedroom-text">
                <h2>Bedroom Accommodation</h2>
                <div class="text-content" data-editable="bedroom-description">
                    ${description}
                </div>
            </div>
            <div class="bedroom-photos${bedroomPhotos.length <= 2 ? ' photos-' + bedroomPhotos.length : ''}">
                ${bedroomPhotos.map((photo, i) => `
                    <div class="photo-container">
                        <img src="${photo?.url || photo?.dataUrl || ''}" alt="${i < (photos.bedroom?.length || 0) ? 'Bedroom' : 'Bathroom'}">
                        <span class="photo-caption">${escapeHtml(formatCaption(photo))}</span>
                    </div>
                `).join('')}
            </div>
            ${generatePageFooter(5, brand)}
        </div>`;
    }

    /**
     * Generate Floor Plans Page (Page 6)
     */
    function generateFloorPlansPage(floorPlan, property, photos, brand) {
        const sqft = property.sqft || '';
        const sqm = sqft ? Math.round(parseInt(sqft) * 0.0929) : '';

        // When no floor plan, show a designed photo gallery spread
        if (!floorPlan) {
            // Hero = best exterior, sidebar = variety from garden/luxury outdoor features
            const heroPhoto = photos.exterior?.[0] || photos.garden?.[0];
            const sidePhotos = [
                ...(photos.garden || []),
                ...(photos.exterior || []).slice(1),
                ...(photos.pool || []),
                ...(photos.tennis || []),
                ...(photos.stables || []),
                ...(photos.lake || []),
                ...(photos.courtyard || []),
                ...(photos.boathouse || []),
                ...(photos.terrace || []),
                ...(photos.view || [])
            ].slice(0, 3);
            return `
            <div class="brochure-page floorplans-page photo-spread-page">
                <div class="spread-hero">
                    <div class="photo-container">
                        <img src="${heroPhoto?.url || heroPhoto?.dataUrl || ''}" alt="Property exterior">
                        <span class="photo-caption">${escapeHtml(formatCaption(heroPhoto || {}))}</span>
                    </div>
                </div>
                <div class="spread-sidebar">
                    <h2>Exterior &amp; Grounds</h2>
                    <div class="spread-sidebar-text" data-editable="exterior-description">
                        ${(() => {
                            const features = (property.keyFeatures || '').split(',').map(f => f.trim()).filter(Boolean);
                            const outdoor = features.filter(f => /garden|ground|acre|garage|annex|pool|terrace|drive|parking|land|heating|stone|tennis|stable|equestrian|lake|pond|paddock|meadow|orchard|woodland|courtyard|barn|boathouse|chapel/i.test(f));
                            const highlights = outdoor.length >= 2 ? outdoor.slice(0, 4) : features.slice(0, 4);
                            if (!highlights.length) return '';
                            return `<p>Key features include ${highlights.map(h => h.toLowerCase()).join(', ')}.</p>`;
                        })()}
                    </div>
                    ${sidePhotos.map(p => `
                        <div class="photo-container">
                            <img src="${p?.url || p?.dataUrl || ''}" alt="Property">
                            <span class="photo-caption">${escapeHtml(formatCaption(p || {}))}</span>
                        </div>
                    `).join('')}
                </div>
                ${generatePageFooter(6, brand)}
            </div>`;
        }

        const exteriorPhotos = [
            photos.exterior?.[1] || photos.pool?.[0],
            photos.exterior?.[2] || photos.garden?.[0]
        ].filter(Boolean);

        return `
        <div class="brochure-page floorplans-page">
            <div class="plans-section">
                <p class="area-info">Approximate Gross Internal Floor Area</p>
                <p class="area-detail">${sqm ? `${sqm} sq m / ` : ''}${sqft ? `${sqft} sq ft` : 'TBC'}</p>

                <p class="disclaimer">This plan is for guidance only and must not be relied upon as a statement of fact. Attention is drawn to the Important Notice on the last page of the text of the Particulars.</p>

                <img src="${floorPlan}" alt="Floor Plan" class="plan-image">

                <div class="legend">
                    <div class="legend-item"><span class="legend-color" style="background: #f5d6d6;"></span> Reception</div>
                    <div class="legend-item"><span class="legend-color" style="background: #d6e5f5;"></span> Bedroom</div>
                    <div class="legend-item"><span class="legend-color" style="background: #d6f5e5;"></span> Bathroom</div>
                    <div class="legend-item"><span class="legend-color" style="background: #f5f5d6;"></span> Kitchen/Utility</div>
                    <div class="legend-item"><span class="legend-color" style="background: #e5e5e5;"></span> Storage</div>
                    <div class="legend-item"><span class="legend-color" style="background: #d6f5d6;"></span> Outside</div>
                </div>
            </div>
            <div class="photos-section">
                ${exteriorPhotos.map(photo => `
                    <img src="${photo?.url || photo?.dataUrl || ''}" alt="Exterior">
                `).join('')}
            </div>
            ${generatePageFooter(6, brand)}
        </div>`;
    }

    /**
     * Generate Gardens Page (Page 7)
     */
    function generateGardensPage(description, property, photos, brand) {
        const gardenPhotos = [
            photos.exterior?.[0] || photos.garden?.[0],
            photos.garden?.[1] || photos.tennis?.[0] || photos.exterior?.[1],
            photos.pool?.[0] || photos.lake?.[0] || photos.stables?.[0] || photos.exterior?.[2],
            photos.terrace?.[0] || photos.garden?.[2]
        ].filter(Boolean).slice(0, 4);

        return `
        <div class="brochure-page gardens-page">
            <div class="text-section">
                <h2>Gardens and grounds</h2>
                <div class="description" data-editable="garden-description">
                    ${description}
                </div>
                ${property.outbuildings ? `
                    <div class="outbuilding-info">
                        <strong>Outbuildings:</strong> ${property.outbuildings}
                    </div>
                ` : ''}
            </div>
            <div class="photo-grid">
                ${gardenPhotos.map((photo, i) => `
                    <div class="photo-container">
                        <img src="${photo?.url || photo?.dataUrl || ''}" alt="Garden ${i + 1}">
                        <span class="photo-caption">${escapeHtml(formatCaption(photo))}</span>
                    </div>
                `).join('')}
            </div>
            ${generatePageFooter(7, brand)}
        </div>`;
    }

    /**
     * Generate Details Page (Page 8)
     */
    function generateDetailsPage(property, location, siteMap, photos, brand) {
        // Pick scenic photos that haven't been heavily used on other pages
        const scenicPhotos = [
            photos.view?.[0] || photos.garden?.[1] || photos.exterior?.[1],
            photos.garden?.[2] || photos.exterior?.[0] || photos.pool?.[0]
        ].filter(Boolean);

        const hasMap = !!siteMap;

        return `
        <div class="brochure-page details-page${hasMap ? '' : ' no-map'}">
            ${hasMap ? `
            <div class="map-section">
                <img src="${siteMap}" alt="Site Map">
                <p class="map-note">Note: "This plan is based upon the Ordnance Survey map with the sanction of the control of H.M. Stationery office. This plan is for convenience of purchasers only. Its accuracy is not guaranteed and it is expressly excluded from any contract."</p>
            </div>` : ''}
            <div class="info-section">
                <h3>Services</h3>
                <p class="info-content" data-editable="services">${property.services || 'Mains water and electricity. Gas central heating. Mains drainage.'}</p>

                <div class="info-divider"></div>

                <h3>Directions</h3>
                <p class="info-content">Postcode: ${property.postcode || 'Available on request'}</p>

                <div class="info-divider"></div>

                <h3>Property information</h3>
                <div class="info-table">
                    <div class="info-row">
                        <span class="info-label">Tenure:</span>
                        <span class="info-value">${property.tenure || 'Freehold'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Local Authority:</span>
                        <span class="info-value">${property.localAuthority || 'To be confirmed'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Council Tax:</span>
                        <span class="info-value">Band ${property.councilTaxBand || 'TBC'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">EPC Rating:</span>
                        <span class="info-value">${property.epc || 'TBC'}</span>
                    </div>
                </div>

                <div class="info-divider"></div>

                <div class="legal-section">
                    <p><strong>Fixtures and fittings:</strong> A list of the fitted carpets, curtains, light fittings and other items fixed to the property which are included in the sale (or may be available by separate negotiation) will be provided by the Seller's Solicitors.</p>
                    <br>
                    <p><strong>Important Notice:</strong> These particulars are not an offer or contract, nor part of one. You should not rely on statements by the agent as being factually accurate about the property, its condition or its value. Areas, measurements and distances given are approximate only.</p>
                </div>

                <div class="doorstep-footer-logo">
                    <img src="${brand.logoUrl || '/static/images/doorstep-logo.png'}" alt="Doorstep">
                </div>
            </div>
            <div class="photo-column">
                ${scenicPhotos.map(photo => `
                    <img src="${photo?.url || photo?.dataUrl || ''}" alt="Property view">
                `).join('')}
            </div>
            ${generatePageFooter(8, brand)}
        </div>`;
    }

    /**
     * Generate Back Cover (Page 9)
     */
    function generateBackCoverPage(photos, agent, brand) {
        // Back cover should ONLY use exterior or garden photos - never interior
        const heroPhoto = photos.exterior?.[1] || photos.garden?.[0] || photos.exterior?.[0] || photos.aerial?.[0];
        const heroUrl = heroPhoto?.url || heroPhoto?.dataUrl || '';

        return `
        <div class="brochure-page back-cover">
            ${heroUrl ? `<img src="${heroUrl}" alt="Property grounds">` : ''}
            <div class="back-cover-content">
                <div class="logo-large"><img src="${brand.logoUrl || '/static/images/doorstep-logo.png'}" alt="Doorstep" style="height: 40px;"></div>
                <div class="contact-info">
                    <p class="office">${agent?.officeName || 'Doorstep'}</p>
                    <p>${agent?.address || ''}</p>
                    <p>${agent?.phone || ''}</p>
                    <p><a href="mailto:${agent?.email || ''}">${agent?.email || ''}</a></p>
                    <p><a href="https://${agent?.website || 'doorstep.co.uk'}">${agent?.website || 'doorstep.co.uk'}</a></p>
                </div>
            </div>
        </div>`;
    }

    // =========================================================================
    // CONTENT GENERATION HELPERS
    // =========================================================================

    /**
     * Generate opening tagline
     */
    function generateTagline(property, location) {
        const type = property.propertyType || 'property';
        const beds = property.bedrooms || '';
        const style = property.style || '';
        const highlight = property.keyFeature || 'beautiful surroundings';
        const area = location.area || property.location || '';

        // Avoid duplication: if style contains "house" and type contains "house", use just style
        let propertyDesc = '';
        const styleLower = style.toLowerCase();
        const typeLower = type.toLowerCase();

        if (style && styleLower.includes('house') && typeLower.includes('house')) {
            // Use style only to avoid "Country House detached house"
            propertyDesc = style.toLowerCase();
        } else if (style && styleLower.includes('cottage') && typeLower.includes('cottage')) {
            propertyDesc = style.toLowerCase();
        } else if (style) {
            propertyDesc = `${style.toLowerCase()} ${type}`;
        } else {
            propertyDesc = type;
        }

        // Generate elegant tagline with accent word
        let tagline = '';
        if (property.listed) {
            tagline = `An exceptional ${property.listed} ${propertyDesc} offering <span class="accent">${highlight}</span>${area ? ` in ${area}` : ''}.`;
        } else if (beds) {
            tagline = `An impressive ${beds} bedroom ${propertyDesc} offering <span class="accent">${highlight}</span>${area ? ` in ${area}` : ''}.`;
        } else {
            tagline = `A distinguished ${propertyDesc} offering <span class="accent">${highlight}</span>${area ? ` in ${area}` : ''}.`;
        }

        return tagline;
    }

    /**
     * Generate room summary with pipe separators
     */
    function generateRoomSummary(property) {
        const rooms = [];

        // Ground floor
        const groundFloor = [];
        if (property.entranceHall) groundFloor.push('Entrance hall');
        if (property.receptions) {
            for (let i = 0; i < Math.min(property.receptions, 3); i++) {
                groundFloor.push(['Sitting room', 'Dining room', 'Family room'][i]);
            }
        }
        if (property.kitchen) groundFloor.push('Kitchen/breakfast room');
        if (property.utility) groundFloor.push('Utility');
        if (property.study) groundFloor.push('Study');
        if (property.cloakroom || property.wc) groundFloor.push('Cloakroom');

        if (groundFloor.length > 0) {
            rooms.push(groundFloor.join(' | '));
        }

        // Bedrooms
        const bedrooms = [];
        if (property.bedrooms) {
            if (property.masterEnsuite) {
                bedrooms.push('Principal bedroom suite with en suite bathroom');
                if (property.bedrooms > 1) {
                    bedrooms.push(`${property.bedrooms - 1} further bedroom${property.bedrooms > 2 ? 's' : ''}`);
                }
            } else {
                bedrooms.push(`${property.bedrooms} bedroom${property.bedrooms > 1 ? 's' : ''}`);
            }
        }
        if (property.bathrooms) {
            bedrooms.push(`${property.bathrooms} bathroom${property.bathrooms > 1 ? 's' : ''}`);
        }

        if (bedrooms.length > 0) {
            rooms.push(bedrooms.join(' | '));
        }

        // Outside
        const outside = [];
        if (property.garden) outside.push('Garden');
        if (property.garage) outside.push('Garage');
        if (property.parking) outside.push('Parking');
        if (property.pool) outside.push('Swimming pool');
        if (property.tennisCourt) outside.push('Tennis court');

        if (outside.length > 0) {
            rooms.push(outside.join(' | '));
        }

        return rooms.join('<br><br>');
    }

    /**
     * Generate distances section
     */
    function generateDistances(location) {
        const distances = [];

        if (location.nearestStation) {
            distances.push(`<p>${location.nearestStation.name} ${location.nearestStation.distance} (${location.nearestStation.journeyTime} to London)</p>`);
        }
        if (location.nearestTown) {
            distances.push(`<p>${location.nearestTown.name} ${location.nearestTown.distance}</p>`);
        }
        if (location.londonDistance) {
            distances.push(`<p>Central London ${location.londonDistance}</p>`);
        }

        if (distances.length === 0) {
            distances.push('<p>Transport links available on request</p>');
        }

        return distances.join('');
    }

    /**
     * Generate situation/location description
     */
    function generateSituation(property, location) {
        const paragraphs = [];
        const address = property.address || '';
        const area = location.area || address.split(',').slice(-2).join(',').trim();

        // Paragraph 1: Setting
        let setting = `<p>${address.split(',')[0] || 'The property'} is located`;
        if (location.areaDescription) {
            setting += ` in ${location.areaDescription}`;
        } else if (area) {
            setting += ` in the desirable area of ${area}`;
        }
        if (location.nearbyLandmark) {
            setting += `, with ${location.nearbyLandmark} nearby`;
        }
        setting += '.</p>';
        paragraphs.push(setting);

        // Paragraph 2: Local amenities
        if (location.amenities || location.nearestTown) {
            let amenities = '<p>The area is well served by local amenities';
            if (location.nearestTown) {
                amenities += ` with ${location.nearestTown.name} offering a range of shops, restaurants, and services`;
            }
            amenities += '.</p>';
            paragraphs.push(amenities);
        }

        // Paragraph 3: Transport
        if (location.transport || location.nearestStation) {
            let transport = '<p>The area has excellent transport links';
            if (location.nearestStation) {
                transport += ` with ${location.nearestStation.name} station providing services to London`;
                if (location.nearestStation.journeyTime) {
                    transport += ` in approximately ${location.nearestStation.journeyTime}`;
                }
            }
            transport += '.</p>';
            paragraphs.push(transport);
        }

        // Paragraph 4: Schools
        if (location.schools && location.schools.length > 0) {
            const schoolNames = location.schools.slice(0, 4).map(s => s.name).join(', ');
            paragraphs.push(`<p>There are a number of well-regarded schools in the area including ${schoolNames}.</p>`);
        }

        // Paragraph 5: Leisure
        if (location.leisure) {
            paragraphs.push(`<p>Leisure facilities in the area include ${location.leisure}.</p>`);
        }

        return paragraphs.join('\n');
    }

    /**
     * Generate property description - comprehensive and lifestyle-focused
     */
    function generatePropertyDescription(property, photos) {
        const paragraphs = [];
        const name = property.address?.split(',')[0] || 'The property';
        const sqft = property.sqft ? Number(property.sqft).toLocaleString() : null;

        // Opening paragraph - set the scene
        let opening = `<p>${name}`;
        if (property.listed) {
            opening += ` is a ${property.listed}`;
        } else {
            opening += ` is a`;
        }
        if (property.style) {
            opening += ` ${property.style.toLowerCase()}`;
        }
        if (property.propertyType && !property.style?.toLowerCase().includes(property.propertyType.toLowerCase())) {
            opening += ` ${property.propertyType}`;
        }
        opening += ' that has been thoughtfully maintained and improved by the current owners. ';
        if (sqft) {
            opening += `The accommodation extends to approximately ${sqft} sq ft and offers flexible living space ideal for modern family life.`;
        }
        opening += '</p>';
        paragraphs.push(opening);

        // Entrance and hallway
        if (property.entranceHall) {
            paragraphs.push('<p>Upon entering, guests are greeted by a welcoming entrance hall that sets the tone for the rest of the house. The hallway provides access to the principal reception rooms and features elegant proportions.</p>');
        }

        // Reception rooms - more descriptive
        if (property.receptions) {
            let receptions = '<p>The reception rooms are generously proportioned and flow naturally from one to another, creating an excellent space for entertaining. ';
            if (property.sittingRoom) {
                receptions += 'The drawing room is a particular highlight, featuring ample natural light and creating a warm, inviting atmosphere. ';
            }
            if (property.diningRoom) {
                receptions += 'The separate dining room provides an elegant setting for formal occasions. ';
            }
            if (property.familyRoom) {
                receptions += 'A relaxed family room offers a more casual living space, perfect for everyday use. ';
            }
            receptions += '</p>';
            paragraphs.push(receptions);
        }

        // Kitchen - lifestyle focused
        if (property.kitchen) {
            let kitchen = '<p>The heart of the home is undoubtedly the kitchen/breakfast room, which has been fitted with quality cabinetry and modern appliances. ';
            kitchen += 'The space is ideal for family life, combining practical work areas with comfortable dining space. ';
            kitchen += 'Natural light floods the room, creating a bright and welcoming environment.</p>';
            paragraphs.push(kitchen);
        }

        // Utility and additional
        if (property.utility || property.study) {
            let additional = '<p>';
            if (property.utility) {
                additional += 'A separate utility room provides practical space for laundry and storage. ';
            }
            if (property.study) {
                additional += 'The study offers a quiet retreat for working from home, increasingly important in today\'s world. ';
            }
            additional += '</p>';
            paragraphs.push(additional);
        }

        return paragraphs.join('\n');
    }

    /**
     * Generate bedroom description - comprehensive
     */
    function generateBedroomDescription(property, photos) {
        const paragraphs = [];

        if (property.bedrooms) {
            // Opening
            let opening = '<p>The bedroom accommodation is arranged ';
            opening += property.floors > 1 ? 'over the upper floors and ' : 'on the first floor, ';
            opening += 'providing excellent space for family and guests alike.</p>';
            paragraphs.push(opening);

            // Principal suite
            if (property.masterEnsuite) {
                let master = '<p>The principal bedroom suite is a particular highlight, offering a peaceful retreat with ample space. ';
                master += 'The room benefits from an en suite bathroom, fitted to a high standard, ';
                master += 'along with built-in wardrobes providing excellent storage. ';
                master += 'Views from the windows look out over the surrounding grounds.</p>';
                paragraphs.push(master);
            }

            // Further bedrooms
            if (property.bedrooms > 1) {
                const further = property.bedrooms - 1;
                let others = `<p>There are ${further} further bedroom${further > 1 ? 's' : ''}, each of generous proportions and filled with natural light. `;
                others += 'These rooms offer flexibility as guest accommodation, children\'s rooms, or home offices as required. ';
                if (property.bathrooms > 1) {
                    others += `The bedrooms are served by ${property.bathrooms - 1} additional bathroom${property.bathrooms > 2 ? 's' : ''}, `;
                    others += 'ensuring convenience for family and guests.</p>';
                } else {
                    others += 'A well-appointed family bathroom serves the additional bedrooms.</p>';
                }
                paragraphs.push(others);
            }

            // Bathrooms detail
            if (property.bathrooms >= 2) {
                let baths = '<p>The bathrooms throughout have been fitted with quality sanitaryware and offer a blend of ';
                baths += 'contemporary style and practical functionality. ';
                baths += 'Several feature both bath and separate shower facilities.</p>';
                paragraphs.push(baths);
            }
        }

        return paragraphs.join('\n');
    }

    /**
     * Generate garden description - comprehensive outdoor living
     */
    function generateGardenDescription(property, photos) {
        const paragraphs = [];
        const name = property.address?.split(',')[0] || 'The property';

        // Opening
        let opening = `<p>${name} is set within `;
        if (property.acres) {
            opening += `approximately ${property.acres} acres of `;
        }
        opening += 'beautifully landscaped gardens and grounds that provide an idyllic setting for outdoor living and entertaining.</p>';
        paragraphs.push(opening);

        // Garden detail
        if (property.garden) {
            let garden = '<p>The gardens have been thoughtfully designed with a combination of formal lawns, ';
            garden += 'mature specimen trees, and colourful herbaceous borders. ';
            garden += 'There are various seating areas positioned to take advantage of the sun throughout the day, ';
            garden += 'perfect for al fresco dining on summer evenings.</p>';
            paragraphs.push(garden);
        }

        // Pool
        if (property.pool) {
            let pool = '<p>A particular highlight is the swimming pool, ';
            pool += 'which provides an excellent leisure facility during the warmer months. ';
            pool += 'The pool area has been landscaped to create a private oasis, ';
            pool += 'with surrounding terrace space for sun loungers and relaxation.</p>';
            paragraphs.push(pool);
        }

        // Parking and outbuildings
        if (property.parking || property.garage) {
            let parking = '<p>Practical considerations have not been overlooked, ';
            if (property.garage) {
                parking += 'with a garage providing secure parking and additional storage. ';
            }
            parking += 'There is ample space for off-street parking, ';
            parking += 'ensuring convenience for residents and visitors alike.</p>';
            paragraphs.push(parking);
        }

        // Summary
        if (property.acres) {
            let summary = `<p>In total, the grounds extend to approximately ${property.acres} acres, `;
            summary += 'offering privacy and seclusion while remaining easily manageable. ';
            summary += 'The outdoor space truly complements the house and offers year-round enjoyment.</p>';
            paragraphs.push(summary);
        }

        return paragraphs.join('\n');
    }

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    function formatPrice(price) {
        if (!price) return 'Price on Application';
        const num = parseInt(price.toString().replace(/[^0-9]/g, ''));
        return '£' + num.toLocaleString('en-GB');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Generate At-a-Glance stats grid
     */
    function generateAtGlance(property) {
        const items = [];

        if (property.bedrooms) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.bedrooms}</span><span class="glance-label">Bedrooms</span></div>`);
        }
        if (property.bathrooms) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.bathrooms}</span><span class="glance-label">Bathrooms</span></div>`);
        }
        if (property.receptions) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.receptions}</span><span class="glance-label">Receptions</span></div>`);
        }
        if (property.sqft) {
            items.push(`<div class="glance-item"><span class="glance-value">${Number(property.sqft).toLocaleString()}</span><span class="glance-label">Sq Ft</span></div>`);
        }
        if (property.acres) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.acres}</span><span class="glance-label">Acres</span></div>`);
        }
        if (property.tenure) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.tenure}</span><span class="glance-label">Tenure</span></div>`);
        }
        if (property.epc) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.epc}</span><span class="glance-label">EPC</span></div>`);
        }
        if (property.councilTaxBand) {
            items.push(`<div class="glance-item"><span class="glance-value">${property.councilTaxBand}</span><span class="glance-label">Council Tax</span></div>`);
        }

        return items.join('');
    }

    /**
     * Format photo caption - turn category codes into readable room names
     */
    function formatCaption(photo) {
        // Prefer AI-generated caption or description
        if (photo.caption && photo.caption.length > 3) return photo.caption;
        if (photo.description && photo.description.length > 3) return photo.description;

        // Format category/room name
        const raw = photo.category || photo.room || photo.type || photo.roomType || '';
        const labels = {
            // Standard rooms
            exterior: 'Exterior', garden: 'Garden', kitchen: 'Kitchen',
            bedroom: 'Bedroom', bedrooms: 'Bedroom', bathroom: 'Bathroom', bathrooms: 'Bathroom',
            living: 'Reception Room', living_room: 'Reception Room',
            dining: 'Dining Room', dining_room: 'Dining Room',
            interior: 'Interior', reception: 'Reception', hallway: 'Hallway',
            // Outdoor
            pool: 'Swimming Pool', terrace: 'Terrace', aerial: 'Aerial View', view: 'View',
            // Luxury features
            tennis: 'Tennis Court', cinema: 'Cinema Room', gym: 'Gymnasium',
            spa: 'Spa', sauna: 'Sauna', wine_cellar: 'Wine Cellar',
            stables: 'Stables', equestrian: 'Equestrian Facilities',
            orangery: 'Orangery', conservatory: 'Conservatory',
            library: 'Library', study: 'Study', office: 'Study',
            games: 'Games Room', billiards: 'Billiards Room',
            boot_room: 'Boot Room', utility: 'Utility Room', laundry: 'Laundry Room',
            garage: 'Garage', barn: 'Barn', outbuilding: 'Outbuilding',
            annexe: 'Annexe', cottage: 'Cottage', lodge: 'Lodge',
            boathouse: 'Boathouse', lake: 'Lake', pond: 'Lake',
            courtyard: 'Courtyard', driveway: 'Driveway',
            chapel: 'Chapel', tower: 'Tower', turret: 'Tower',
            cellar: 'Wine Cellar', pantry: 'Pantry', larder: 'Pantry',
            cloakroom: 'Cloakroom', wc: 'WC',
            balcony: 'Balcony', loggia: 'Loggia', veranda: 'Veranda',
            snug: 'Snug', drawing: 'Drawing Room', sitting: 'Sitting Room',
            music: 'Music Room', nursery: 'Nursery', dressing: 'Dressing Room',
            plant: 'Plant Room', workshop: 'Workshop',
            orchard: 'Orchard', paddock: 'Paddock', meadow: 'Meadow',
            woodland: 'Woodland', stream: 'Stream'
        };
        if (labels[raw.toLowerCase()]) return labels[raw.toLowerCase()];

        // Fallback: detect from filename/name
        const name = (photo.name || photo.filename || '').toLowerCase();
        const combined = raw.toLowerCase() + ' ' + name;
        // Standard rooms
        if (combined.includes('exterior') || combined.includes('front')) return 'Exterior';
        if (combined.includes('kitchen')) return 'Kitchen';
        if (combined.includes('bedroom') || name.includes('bed_')) return 'Bedroom';
        if (combined.includes('bathroom') || combined.includes('ensuite')) return 'Bathroom';
        if (combined.includes('living') || combined.includes('lounge')) return 'Reception Room';
        if (combined.includes('dining')) return 'Dining Room';
        // Luxury outdoor
        if (combined.includes('tennis')) return 'Tennis Court';
        if (combined.includes('pool') || combined.includes('swimming')) return 'Swimming Pool';
        if (combined.includes('stable') || combined.includes('equestrian')) return 'Stables';
        if (combined.includes('lake') || combined.includes('pond')) return 'Lake';
        if (combined.includes('orchard')) return 'Orchard';
        if (combined.includes('paddock') || combined.includes('meadow')) return 'Paddock';
        if (combined.includes('courtyard')) return 'Courtyard';
        if (combined.includes('drive')) return 'Driveway';
        // Luxury indoor
        if (combined.includes('cinema') || combined.includes('theatre') || combined.includes('theater')) return 'Cinema Room';
        if (combined.includes('gym') || combined.includes('fitness')) return 'Gymnasium';
        if (combined.includes('spa') || combined.includes('sauna') || combined.includes('steam')) return 'Spa';
        if (combined.includes('wine') || combined.includes('cellar')) return 'Wine Cellar';
        if (combined.includes('library')) return 'Library';
        if (combined.includes('games') || combined.includes('billiard') || combined.includes('snooker')) return 'Games Room';
        if (combined.includes('orangery')) return 'Orangery';
        if (combined.includes('conservatory')) return 'Conservatory';
        if (combined.includes('boot_room') || combined.includes('bootroom')) return 'Boot Room';
        if (combined.includes('utility') || combined.includes('laundry')) return 'Utility Room';
        if (combined.includes('barn')) return 'Barn';
        if (combined.includes('annexe') || combined.includes('annex')) return 'Annexe';
        if (combined.includes('cottage') || combined.includes('lodge')) return 'Cottage';
        if (combined.includes('boathouse') || combined.includes('boat_house')) return 'Boathouse';
        if (combined.includes('chapel')) return 'Chapel';
        if (combined.includes('tower') || combined.includes('turret')) return 'Tower';
        if (combined.includes('balcony') || combined.includes('loggia') || combined.includes('veranda')) return 'Balcony';
        if (combined.includes('drawing')) return 'Drawing Room';
        if (combined.includes('sitting')) return 'Sitting Room';
        if (combined.includes('snug')) return 'Snug';
        if (combined.includes('music')) return 'Music Room';
        if (combined.includes('dressing')) return 'Dressing Room';
        if (combined.includes('pantry') || combined.includes('larder')) return 'Pantry';
        if (combined.includes('study') || combined.includes('office')) return 'Study';
        if (combined.includes('garage')) return 'Garage';
        if (combined.includes('garden')) return 'Garden';
        if (combined.includes('terrace') || combined.includes('patio')) return 'Terrace';
        if (combined.includes('aerial') || combined.includes('drone')) return 'Aerial View';
        return '';
    }

    /**
     * Categorize photos by room type
     */
    function categorizePhotos(photos) {
        const categories = {
            exterior: [],
            aerial: [],
            view: [],
            living: [],
            kitchen: [],
            dining: [],
            bedroom: [],
            bathroom: [],
            garden: [],
            pool: [],
            terrace: [],
            reception: [],
            interior: [],
            // Luxury features
            tennis: [],
            cinema: [],
            gym: [],
            spa: [],
            wine_cellar: [],
            stables: [],
            orangery: [],
            library: [],
            games: [],
            barn: [],
            annexe: [],
            boathouse: [],
            lake: [],
            courtyard: [],
            garage: [],
            all: []
        };

        photos.forEach(photo => {
            categories.all.push(photo);

            const type = (photo.type || photo.category || photo.room || '').toLowerCase();
            const desc = (photo.description || photo.label || '').toLowerCase();
            const name = (photo.name || photo.filename || '').toLowerCase();
            const combined = type + ' ' + desc + ' ' + name;

            // Luxury outdoor features (check first — more specific than generic garden/exterior)
            if (combined.includes('tennis')) {
                categories.tennis.push(photo);
            } else if (combined.includes('stable') || combined.includes('equestrian') || combined.includes('horse')) {
                categories.stables.push(photo);
            } else if (combined.includes('boathouse') || combined.includes('boat_house')) {
                categories.boathouse.push(photo);
            } else if (combined.includes('lake') || combined.includes('pond')) {
                categories.lake.push(photo);
            } else if (combined.includes('courtyard')) {
                categories.courtyard.push(photo);
            // Luxury indoor features (check before generic interior)
            } else if (combined.includes('cinema') || combined.includes('theatre') || combined.includes('theater') || combined.includes('screening')) {
                categories.cinema.push(photo);
            } else if (combined.includes('gym') || combined.includes('fitness') || combined.includes('exercise')) {
                categories.gym.push(photo);
            } else if (combined.includes('spa') || combined.includes('sauna') || combined.includes('steam') || combined.includes('jacuzzi') || combined.includes('hot_tub') || combined.includes('hottub')) {
                categories.spa.push(photo);
            } else if (combined.includes('wine') || combined.includes('cellar')) {
                categories.wine_cellar.push(photo);
            } else if (combined.includes('library')) {
                categories.library.push(photo);
            } else if (combined.includes('games') || combined.includes('billiard') || combined.includes('snooker') || combined.includes('playroom')) {
                categories.games.push(photo);
            } else if (combined.includes('orangery') || combined.includes('conservatory') || combined.includes('sunroom')) {
                categories.orangery.push(photo);
            } else if (combined.includes('barn') || combined.includes('outbuilding')) {
                categories.barn.push(photo);
            } else if (combined.includes('annexe') || combined.includes('annex') || combined.includes('cottage') || combined.includes('lodge')) {
                categories.annexe.push(photo);
            } else if (combined.includes('garage') || combined.includes('carport')) {
                categories.garage.push(photo);
            // Standard categories
            } else if (combined.includes('exterior') || combined.includes('front') || combined.includes('outside')) {
                categories.exterior.push(photo);
            } else if (combined.includes('aerial') || combined.includes('drone')) {
                categories.aerial.push(photo);
            } else if (combined.includes('view') || combined.includes('outlook')) {
                categories.view.push(photo);
            } else if (combined.includes('living') || combined.includes('lounge') || combined.includes('sitting') || combined.includes('drawing') || combined.includes('snug') || combined.includes('music')) {
                categories.living.push(photo);
            } else if (combined.includes('kitchen') || combined.includes('pantry') || combined.includes('larder')) {
                categories.kitchen.push(photo);
            } else if (combined.includes('dining')) {
                categories.dining.push(photo);
            } else if (combined.includes('bedroom') || combined.includes('master') || combined.includes('nursery') || combined.includes('dressing')) {
                categories.bedroom.push(photo);
            } else if (combined.includes('bathroom') || combined.includes('ensuite') || combined.includes('shower') || combined.includes('cloakroom') || combined.includes('wc')) {
                categories.bathroom.push(photo);
            } else if (combined.includes('pool') || combined.includes('swimming')) {
                categories.pool.push(photo);
            } else if (combined.includes('garden') || combined.includes('orchard') || combined.includes('paddock') || combined.includes('meadow') || combined.includes('woodland')) {
                categories.garden.push(photo);
            } else if (combined.includes('terrace') || combined.includes('patio') || combined.includes('balcony') || combined.includes('loggia') || combined.includes('veranda')) {
                categories.terrace.push(photo);
            } else if (combined.includes('reception') || combined.includes('hall') || combined.includes('entrance') || combined.includes('foyer')) {
                categories.reception.push(photo);
            } else if (combined.includes('study') || combined.includes('office')) {
                categories.reception.push(photo);
            } else if (combined.includes('utility') || combined.includes('laundry') || combined.includes('boot')) {
                categories.interior.push(photo);
            } else {
                categories.interior.push(photo);
            }
        });

        return categories;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        generate,
        generateTagline,
        generateRoomSummary,
        generateSituation,
        categorizePhotos,
        DEFAULT_BRAND,
        FONTS
    };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.KnightFrankTemplate = KnightFrankTemplate;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = KnightFrankTemplate;
}

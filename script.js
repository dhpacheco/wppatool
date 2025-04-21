document.addEventListener('DOMContentLoaded', () => {
    // --- Constants and Configuration ---
    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 10.0;
    const ZOOM_STEP = 1.2;
    const HANDLE_SIZE = 8; // Visual size on canvas
    const HANDLE_HIT_TOLERANCE = 6; // Click tolerance for handles
    const MIN_BOX_SIZE_PX = 4; // Min screen pixels for a valid box draw

    // --- Predefined Classes ---
    const PREDEFINED_CLASSES = ["palma", "tenar", "hipotenar", "infradigital", "lateral"];

    // --- DOM Elements ---
    const imageInput = document.getElementById('imageInput');
    const annotationInput = document.getElementById('annotationInput');
    const openImageBtn = document.getElementById('openImageBtn');
    const addImageBtn = document.getElementById('addImageBtn'); // Botão Adicionar
    const loadAnnotationsBtn = document.getElementById('loadAnnotationsBtn');
    const prevImageBtn = document.getElementById('prevImageBtn');
    const nextImageBtn = document.getElementById('nextImageBtn');
    const imageInfoSpan = document.getElementById('imageInfo');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const saveAnnotationsBtn = document.getElementById('saveAnnotationsBtn');
    const saveCropsBtn = document.getElementById('saveCropsBtn');
    const cropFormatSelect = document.getElementById('cropFormatSelect');
    const deleteBtn = document.getElementById('deleteBtn');
    const drawModeBtn = document.getElementById('drawModeBtn');
    const classSelect = document.getElementById('classSelect');
    const canvasContainer = document.getElementById('canvasContainer');
    const canvas = document.getElementById('annotationCanvas');
    const ctx = canvas.getContext('2d');
    const statusBar = document.getElementById('statusBar');
    const annotationListUl = document.getElementById('currentAnnotations');

    // --- Application State ---
    let imageFiles = [];
    let currentImageIndex = -1;
    let originalImage = null;
    let imageDimensionsCache = {};
    let annotations = {};
    let knownClasses = new Set(PREDEFINED_CLASSES);
    let scale = 1.0;
    let panX = 0;
    let panY = 0;
    let isDrawingEnabled = false;
    let selectedAnnotationIndex = null;
    let fileInputMode = 'open'; // 'open' or 'add'
    let interactionState = {
        mode: null,
        resizeHandle: null,
        startX: null,
        startY: null,
        lastX: null,
        lastY: null,
        isDragging: false,
        cursor: 'default'
    };

    // --- Initialization ---
    function initialize() {
        populateClassDropdown();
        addEventListeners();
        updateUIState();
        setStatus("Pronto. Abra uma ou mais imagens para começar.");
        checkJSZip();
    }

    function checkJSZip() {
        if (typeof JSZip === 'undefined') {
            console.warn("Biblioteca JSZip não encontrada. O salvamento será feito como arquivos individuais.");
            // Alterar botões ou mostrar aviso permanente se desejar
        }
    }

    function populateClassDropdown() {
        const sortedClasses = Array.from(knownClasses).sort();
        const currentSelection = classSelect.value;

        classSelect.innerHTML = '';
        sortedClasses.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls;
            option.textContent = cls;
            classSelect.appendChild(option);
        });

        if (knownClasses.has(currentSelection)) {
            classSelect.value = currentSelection;
        } else if (sortedClasses.length > 0) {
            classSelect.value = sortedClasses[0];
        } else {
             // Adiciona opção placeholder se não houver classes
             const option = document.createElement('option');
             option.textContent = 'Nenhuma classe';
             option.disabled = true;
             classSelect.appendChild(option);
        }
        updateUIState();
    }

    // --- Event Listeners ---
    function addEventListeners() {
        openImageBtn.addEventListener('click', () => {
            fileInputMode = 'open';
            imageInput.click();
        });
        addImageBtn.addEventListener('click', () => { // Listener para Adicionar
            fileInputMode = 'add';
            imageInput.click();
        });
        loadAnnotationsBtn.addEventListener('click', () => annotationInput.click());
        imageInput.addEventListener('change', handleImageFiles);
        annotationInput.addEventListener('change', handleAnnotationFiles);

        prevImageBtn.addEventListener('click', prevImage);
        nextImageBtn.addEventListener('click', nextImage);
        zoomInBtn.addEventListener('click', zoomIn);
        zoomOutBtn.addEventListener('click', zoomOut);
        saveAnnotationsBtn.addEventListener('click', saveAllAnnotations);
        saveCropsBtn.addEventListener('click', saveCrops);
        deleteBtn.addEventListener('click', deleteSelectedAnnotation);
        drawModeBtn.addEventListener('click', toggleDrawMode);

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('wheel', onWheelZoom, { passive: false });
        canvas.addEventListener('dblclick', onDoubleClick);

        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleWindowResize);
    }

    // --- File Handling ---
    function handleImageFiles(event) {
        const newlySelectedFiles = Array.from(event.target.files);
        if (newlySelectedFiles.length === 0) {
            imageInput.value = null;
            return;
        }

        if (fileInputMode === 'open') {
            console.log("Modo: Abrir/Substituir imagens");
            imageFiles = newlySelectedFiles.sort((a, b) => a.name.localeCompare(b.name));
            annotations = {};
            imageDimensionsCache = {};
            knownClasses = new Set(PREDEFINED_CLASSES);
            populateClassDropdown();
            currentImageIndex = 0;
            loadImage(currentImageIndex);
            setStatus(`Carregadas ${imageFiles.length} novas imagens.`);

        } else if (fileInputMode === 'add') {
            console.log("Modo: Adicionar imagens");
            const currentImageName = (currentImageIndex >= 0 && currentImageIndex < imageFiles.length)
                                    ? imageFiles[currentImageIndex].name
                                    : null;

            let addedCount = 0;
            const existingFileNames = new Set(imageFiles.map(f => f.name));

            newlySelectedFiles.forEach(file => {
                if (!existingFileNames.has(file.name)) {
                    imageFiles.push(file);
                    existingFileNames.add(file.name);
                    addedCount++;
                } else {
                    console.warn(`Imagem "${file.name}" já existe na lista, pulando.`);
                }
            });

            if (addedCount > 0) {
                imageFiles.sort((a, b) => a.name.localeCompare(b.name));

                if (currentImageName) {
                    const newIndex = imageFiles.findIndex(f => f.name === currentImageName);
                    if (newIndex !== -1) {
                        currentImageIndex = newIndex;
                         updateUIState();
                         setStatus(`${addedCount} imagens adicionadas. Total: ${imageFiles.length}. Imagem atual: ${currentImageName}`);
                    } else {
                        currentImageIndex = 0;
                        loadImage(currentImageIndex);
                         setStatus(`${addedCount} imagens adicionadas. Total: ${imageFiles.length}. Exibindo a primeira imagem.`);
                    }
                } else {
                     currentImageIndex = 0;
                     loadImage(currentImageIndex);
                     setStatus(`${addedCount} imagens adicionadas. Total: ${imageFiles.length}. Exibindo a primeira imagem.`);
                }
            } else {
                 setStatus("Nenhuma imagem nova adicionada (possivelmente duplicatas).");
            }
        }

        imageInput.value = null;
        updateUIState();
        updateAnnotationList();
    }

    // --- Image Loading and Display ---
    function loadImage(index) {
        if (index < 0 || index >= imageFiles.length) {
            setStatus("Índice de imagem inválido.");
            return;
        }
        const file = imageFiles[index];
        const reader = new FileReader();

        setStatus(`Carregando ${file.name}...`);
        originalImage = null;
        selectedAnnotationIndex = null; // Deseleciona anotação ao mudar imagem
        updateUIState(); // Mostra estado de carregamento

        reader.onload = function(e) {
            const img = new Image();
            img.onload = () => {
                if (index !== currentImageIndex) return; // Evita condição de corrida se usuário navegar rápido
                originalImage = img;
                // Cache dimensions
                imageDimensionsCache[file.name] = { w: img.naturalWidth, h: img.naturalHeight };
                resetView();
                fitImageToContainer(); // Chama redrawAll internamente
                updateUIState();
                updateAnnotationList();
                setStatus(`Exibindo ${file.name} (${index + 1}/${imageFiles.length})`);
            };
            img.onerror = () => {
                setStatus(`Erro ao carregar imagem: ${file.name}`);
                console.error(`Erro ao carregar imagem: ${file.name}`);
                originalImage = null;
                 // Limpa canvas se falhar
                 ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
                 updateUIState();
                 updateAnnotationList(); // Mostra mensagem de erro na lista
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            setStatus(`Erro ao ler arquivo: ${file.name}`);
            console.error(`Erro ao ler arquivo: ${file.name}`);
            originalImage = null;
            ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
            updateUIState();
            updateAnnotationList();
        };
        reader.readAsDataURL(file);
    }

    async function getImageDimensions(filename) {
        if (imageDimensionsCache[filename]) {
            return imageDimensionsCache[filename];
        }
        const imageFile = imageFiles.find(f => f.name === filename);
        if (!imageFile) return null;

        return new Promise((resolve) => {
             const img = new Image();
             img.onload = () => {
                 const dims = { w: img.naturalWidth, h: img.naturalHeight };
                 imageDimensionsCache[filename] = dims; // Cache it
                 resolve(dims);
             };
             img.onerror = () => {
                 console.error(`Não foi possível carregar a imagem ${filename} para obter dimensões.`);
                 resolve(null);
             };
             const reader = new FileReader();
             reader.onload = (e) => { img.src = e.target.result; };
             reader.onerror = () => { console.error(`Erro ao ler ${filename}`); resolve(null); };
             reader.readAsDataURL(imageFile);
        });
    }

    function resetView() {
        scale = 1.0;
        panX = 0;
        panY = 0;
        // selectedAnnotationIndex = null; // Não reseta seleção aqui, pois loadImage já faz isso
        interactionState.mode = null;
        interactionState.isDragging = false;
        resetInteractionCoords();
    }

     function fitImageToContainer() {
         if (!originalImage || !canvasContainer || originalImage.naturalWidth === 0 || originalImage.naturalHeight === 0) {
              redrawAll(); // Limpa canvas se não houver imagem
             return;
         }

         const containerWidth = canvasContainer.clientWidth;
         const containerHeight = canvasContainer.clientHeight;
         const imgWidth = originalImage.naturalWidth;
         const imgHeight = originalImage.naturalHeight;

         if (containerWidth <= 0 || containerHeight <= 0) return;

         const scaleX = containerWidth / imgWidth;
         const scaleY = containerHeight / imgHeight;
         scale = Math.min(scaleX, scaleY);
         scale = Math.max(MIN_ZOOM, Math.min(scale, MAX_ZOOM)); // Garante que fique entre MIN e MAX

         const canvasWidth = imgWidth * scale;
         const canvasHeight = imgHeight * scale;
         panX = (containerWidth - canvasWidth) / 2;
         panY = (containerHeight - canvasHeight) / 2;

         console.log(`Fit inicial: scale=${scale.toFixed(3)}, panX=${panX.toFixed(1)}, panY=${panY.toFixed(1)}`);
         redrawAll();
     }

    function handleWindowResize() {
        if (originalImage) {
           fitImageToContainer(); // Re-fit and center
        } else {
            // Ensure canvas is cleared if no image and window resized
             const dpr = window.devicePixelRatio || 1;
             const containerWidth = canvasContainer.clientWidth;
             const containerHeight = canvasContainer.clientHeight;
             canvas.width = containerWidth * dpr;
             canvas.height = containerHeight * dpr;
             canvas.style.width = `${containerWidth}px`;
             canvas.style.height = `${containerHeight}px`;
             ctx.scale(dpr, dpr);
             ctx.clearRect(0, 0, containerWidth, containerHeight);
        }
    }

    // --- Navigation ---
    function prevImage() {
        if (currentImageIndex > 0) {
             currentImageIndex--; // Atualiza índice ANTES de carregar
            loadImage(currentImageIndex);
        }
    }

    function nextImage() {
        if (currentImageIndex < imageFiles.length - 1) {
             currentImageIndex++; // Atualiza índice ANTES de carregar
            loadImage(currentImageIndex);
        }
    }

    // --- Zooming and Panning ---
    function zoom(factor, pivotX, pivotY) {
        if (!originalImage) return;
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * factor));
        if (Math.abs(newScale - scale) < 1e-6) return;

        const dpr = window.devicePixelRatio || 1;
        const canvasPivotX = pivotX * dpr; // Convert pivot to internal canvas coords
        const canvasPivotY = pivotY * dpr;

        const imgX = (canvasPivotX - panX) / scale;
        const imgY = (canvasPivotY - panY) / scale;

        scale = newScale;

        panX = canvasPivotX - imgX * scale;
        panY = canvasPivotY - imgY * scale;

        redrawAll();
        updateUIState();
    }

    function zoomIn() {
        const centerX = canvasContainer.clientWidth / 2; // Use container center as pivot
        const centerY = canvasContainer.clientHeight / 2;
        zoom(ZOOM_STEP, centerX, centerY);
    }

    function zoomOut() {
        const centerX = canvasContainer.clientWidth / 2;
        const centerY = canvasContainer.clientHeight / 2;
        zoom(1 / ZOOM_STEP, centerX, centerY);
    }

    function onWheelZoom(event) {
        if (!originalImage) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;

        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left; // Pivot based on CSS pixels
        const mouseY = event.clientY - rect.top;

        zoom(delta, mouseX, mouseY);
    }

    // --- Coordinate Conversion ---
    function canvasToImageCoords(cx, cy) { // cx, cy are internal canvas coords (with DPR)
        if (scale === 0) return { x: 0, y: 0 };
        const imgX = (cx - panX) / scale;
        const imgY = (cy - panY) / scale;
        return { x: imgX, y: imgY };
    }

    function imageToCanvasCoords(ix, iy) { // Returns internal canvas coords (with DPR)
        const canvasX = ix * scale + panX;
        const canvasY = iy * scale + panY;
        return { x: canvasX, y: canvasY };
    }

    // --- Drawing ---
    function redrawAll() {
        const dpr = window.devicePixelRatio || 1;
        const containerWidth = canvasContainer.clientWidth;
        const containerHeight = canvasContainer.clientHeight;

        // Resize canvas considering DPR
        if (canvas.width !== containerWidth * dpr || canvas.height !== containerHeight * dpr) {
            canvas.width = containerWidth * dpr;
            canvas.height = containerHeight * dpr;
            canvas.style.width = `${containerWidth}px`;
            canvas.style.height = `${containerHeight}px`;
            ctx.scale(dpr, dpr);
            console.log(`Canvas resized to ${canvas.width}x${canvas.height} (DPR: ${dpr})`);
        }

        // Clear canvas (relative to container size before internal scaling)
        ctx.clearRect(0, 0, containerWidth, containerHeight);

        if (!originalImage) return;

        ctx.save();
        // Apply pan & zoom (already scaled for DPR)
        ctx.translate(panX / dpr, panY / dpr);
        ctx.scale(scale / dpr, scale / dpr);

        // Draw image
        ctx.imageSmoothingEnabled = scale < 3; // Disable smoothing when very zoomed in
        ctx.drawImage(originalImage, 0, 0, originalImage.naturalWidth, originalImage.naturalHeight);
        ctx.imageSmoothingEnabled = true; // Re-enable for other drawings

        // Draw annotations
        const currentFilename = imageFiles[currentImageIndex]?.name;
        const currentAnns = annotations[currentFilename] || [];
        currentAnns.forEach((ann, index) => drawAnnotation(ann, index));

        ctx.restore(); // Remove pan/zoom

        // --- Draw temporary elements (screen coords) ---
        ctx.save();
        if (interactionState.mode === 'draw' && interactionState.startX !== null) {
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
            ctx.lineWidth = 1; // Screen pixel line width
            ctx.setLineDash([3, 3]);
            if (typeof interactionState.startX === 'number' && typeof interactionState.startY === 'number' &&
                typeof interactionState.lastX === 'number' && typeof interactionState.lastY === 'number') {
                // Draw using internal canvas coords divided by DPR for screen pixel coords
                ctx.strokeRect(
                    interactionState.startX / dpr, interactionState.startY / dpr,
                    (interactionState.lastX - interactionState.startX) / dpr,
                    (interactionState.lastY - interactionState.startY) / dpr
                );
            }
            ctx.setLineDash([]);
        }

        // Draw resize handles
        if (selectedAnnotationIndex !== null && currentAnns[selectedAnnotationIndex]) {
            drawResizeHandles(currentAnns[selectedAnnotationIndex]);
        }
        ctx.restore();
    }

     function drawAnnotation(ann, index) {
         // Coords relative to image origin due to previous translate/scale
         const x = Math.min(ann.x1, ann.x2);
         const y = Math.min(ann.y1, ann.y2);
         const width = Math.abs(ann.x2 - ann.x1);
         const height = Math.abs(ann.y2 - ann.y1);

         if (width <= 0 || height <= 0) return;

         const isSelected = (index === selectedAnnotationIndex);
         const dpr = window.devicePixelRatio || 1;

         // Box Style
         ctx.strokeStyle = isSelected ? 'cyan' : 'red';
         ctx.lineWidth = Math.max(1 / scale, (isSelected ? 2.5 : 1.5)) ; // Adjusted lineWidth logic
         ctx.fillStyle = isSelected ? 'rgba(0, 255, 255, 0.15)' : 'rgba(255, 0, 0, 0.1)';

         ctx.fillRect(x, y, width, height);
         ctx.strokeRect(x, y, width, height);

         // Label Style
         const fontSize = Math.max(8, 10 / scale);
         ctx.font = `bold ${fontSize}px sans-serif`;
         ctx.textBaseline = 'top';
         const text = ann.label;
         const textMetrics = ctx.measureText(text);
         const textWidth = textMetrics.width;
         const textHeight = fontSize * 1.2;
         const padding = 2 / scale;

         // Label Background
         ctx.fillStyle = isSelected ? 'rgba(0, 200, 200, 0.9)' : 'rgba(200, 0, 0, 0.9)';
         ctx.fillRect(x, y, textWidth + padding * 2, textHeight + padding);

         // Label Text
         ctx.fillStyle = 'white';
         ctx.fillText(text, x + padding, y + padding / 2);
     }

    function drawResizeHandles(ann) {
        const c1 = imageToCanvasCoords(ann.x1, ann.y1); // Internal canvas coords
        const c2 = imageToCanvasCoords(ann.x2, ann.y2);
        const dpr = window.devicePixelRatio || 1;

        // Calculate screen pixel coords for handles
        const xmin = Math.min(c1.x, c2.x) / dpr;
        const ymin = Math.min(c1.y, c2.y) / dpr;
        const xmax = Math.max(c1.x, c2.x) / dpr;
        const ymax = Math.max(c1.y, c2.y) / dpr;

        const handles = [
            { x: xmin, y: ymin, cursor: 'nwse-resize', tag: 'nw' },
            { x: xmax, y: ymin, cursor: 'nesw-resize', tag: 'ne' },
            { x: xmin, y: ymax, cursor: 'nesw-resize', tag: 'sw' },
            { x: xmax, y: ymax, cursor: 'nwse-resize', tag: 'se' }
        ];

        ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1; // 1 CSS pixel
        const hs = HANDLE_SIZE / 2; // Half handle size in CSS pixels

        handles.forEach(handle => {
            ctx.fillRect(handle.x - hs, handle.y - hs, HANDLE_SIZE, HANDLE_SIZE);
            ctx.strokeRect(handle.x - hs, handle.y - hs, HANDLE_SIZE, HANDLE_SIZE);
        });
    }

    // --- Mouse Interactions ---
    function resetInteractionCoords() {
        interactionState.startX = null;
        interactionState.startY = null;
        interactionState.lastX = null;
        interactionState.lastY = null;
    }

    function setCanvasCursor(style) {
        interactionState.cursor = style;
        canvas.style.cursor = style;
    }

    function getMouseCanvasCoords(event) { // Returns internal canvas coords (scaled by DPR)
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
            x: (event.clientX - rect.left) * dpr,
            y: (event.clientY - rect.top) * dpr
        };
    }

    function onMouseDown(event) {
        if (!originalImage || event.button !== 0) return;

        interactionState.isDragging = true;
        const coords = getMouseCanvasCoords(event); // Internal canvas coords
        interactionState.startX = coords.x;
        interactionState.startY = coords.y;
        interactionState.lastX = coords.x;
        interactionState.lastY = coords.y;

        // 1. Check resize handle
        const clickedHandle = getHandleAtCoords(coords.x, coords.y);
        if (clickedHandle && selectedAnnotationIndex !== null) {
            interactionState.mode = 'resize';
            interactionState.resizeHandle = clickedHandle;
            setCanvasCursor(getResizeCursor(interactionState.resizeHandle));
            setStatus(`Redimensionando anotação ${selectedAnnotationIndex} (${interactionState.resizeHandle})`);
            return;
        }

        // 2. Check annotation body
        const clickedIndex = getAnnotationAtCoords(coords.x, coords.y);
        if (clickedIndex !== null) {
            if (selectedAnnotationIndex !== clickedIndex) {
                selectAnnotation(clickedIndex);
            }
            interactionState.mode = 'select';
            setCanvasCursor('move');
            setStatus(`Anotação ${selectedAnnotationIndex} selecionada. Arraste para mover ou clique duplo para editar.`);
            return;
        }

        // 3. Check drawing mode
        if (isDrawingEnabled) {
            selectAnnotation(null);
            interactionState.mode = 'draw';
            setCanvasCursor('crosshair');
            setStatus(`Desenhando nova anotação para classe: ${classSelect.value}`);
            return;
        }

        // 4. Pan
        selectAnnotation(null);
        interactionState.mode = 'pan';
        setCanvasCursor('grab');
        setStatus("Movendo a imagem (pan).");
    }

    function onMouseMove(event) {
        const coords = getMouseCanvasCoords(event); // Internal canvas coords

        if (!interactionState.isDragging || !originalImage) {
             if (originalImage) updateCursorOnHover(event); // Update hover cursor if not dragging
            return;
        }

        const deltaX = coords.x - interactionState.lastX; // Delta in internal coords
        const deltaY = coords.y - interactionState.lastY;

        switch (interactionState.mode) {
            case 'draw':
                interactionState.lastX = coords.x;
                interactionState.lastY = coords.y;
                redrawAll();
                break;
            case 'resize':
                resizeAnnotation(coords.x, coords.y); // Pass internal coords
                redrawAll();
                break;
            case 'select':
                 const dpr = window.devicePixelRatio || 1;
                 const dragThreshold = 5 * dpr; // Threshold in internal coords
                 const movedDist = Math.sqrt(Math.pow(coords.x - interactionState.startX, 2) + Math.pow(coords.y - interactionState.startY, 2));
                if (movedDist > dragThreshold) {
                     interactionState.mode = 'move';
                     setCanvasCursor('move');
                     setStatus(`Movendo anotação ${selectedAnnotationIndex}.`);
                     moveAnnotation(deltaX, deltaY); // Apply initial move
                     redrawAll();
                }
                break;
            case 'move':
                moveAnnotation(deltaX, deltaY);
                redrawAll();
                break;
            case 'pan':
                panX += deltaX;
                panY += deltaY;
                if (interactionState.cursor !== 'grabbing') setCanvasCursor('grabbing');
                redrawAll();
                break;
        }

        interactionState.lastX = coords.x;
        interactionState.lastY = coords.y;
    }

    function onMouseUp(event) {
        if (!interactionState.isDragging || event.button !== 0) return;

        const endCoords = getMouseCanvasCoords(event); // Internal canvas coords
        const currentFilename = imageFiles[currentImageIndex]?.name;
        const dpr = window.devicePixelRatio || 1;

        switch (interactionState.mode) {
            case 'draw':
                const canvasStartX = interactionState.startX;
                const canvasStartY = interactionState.startY;
                const canvasEndX = endCoords.x;
                const canvasEndY = endCoords.y;

                // Check minimum size in SCREEN pixels
                const drawnWidth = Math.abs(canvasEndX - canvasStartX) / dpr;
                const drawnHeight = Math.abs(canvasEndY - canvasStartY) / dpr;

                if (drawnWidth >= MIN_BOX_SIZE_PX && drawnHeight >= MIN_BOX_SIZE_PX) {
                    const imgStart = canvasToImageCoords(canvasStartX, canvasStartY);
                    const imgEnd = canvasToImageCoords(canvasEndX, canvasEndY);
                    const newLabel = classSelect.value;

                    if (!newLabel || classSelect.selectedOptions[0]?.disabled) { // Check if a valid class is selected
                        setStatus("Erro: Nenhuma classe válida selecionada.");
                        alert("Por favor, selecione uma classe válida antes de desenhar.");
                        break;
                    }

                    const existingAnnotations = annotations[currentFilename] || [];
                    const classExists = existingAnnotations.some(ann => ann.label === newLabel);

                    if (classExists) {
                        setStatus(`Erro: Classe '${newLabel}' já existe para esta imagem.`);
                        alert(`Erro: Classe '${newLabel}' já existe nesta imagem. Apenas uma anotação por classe é permitida.`);
                    } else {
                        const dims = imageDimensionsCache[currentFilename];
                        let x1 = Math.min(imgStart.x, imgEnd.x);
                        let y1 = Math.min(imgStart.y, imgEnd.y);
                        let x2 = Math.max(imgStart.x, imgEnd.x);
                        let y2 = Math.max(imgStart.y, imgEnd.y);

                        // Clamp to image boundaries if dimensions are known
                        if (dims) {
                           x1 = Math.max(0, x1);
                           y1 = Math.max(0, y1);
                           x2 = Math.min(dims.w, x2);
                           y2 = Math.min(dims.h, y2);
                        }
                         // Prevent zero-sized boxes after clamping
                         if (x2 > x1 && y2 > y1) {
                              const newAnn = { x1, y1, x2, y2, label: newLabel };
                              if (!annotations[currentFilename]) annotations[currentFilename] = [];
                              annotations[currentFilename].push(newAnn);
                              selectAnnotation(annotations[currentFilename].length - 1);
                              setStatus(`Adicionada anotação ${selectedAnnotationIndex} ('${newLabel}')`);
                         } else {
                              setStatus("Desenho cancelado (caixa resultante inválida após ajuste aos limites).");
                         }
                    }
                } else {
                    setStatus("Desenho cancelado (caixa muito pequena).");
                }
                break;

            case 'resize':
                if (selectedAnnotationIndex !== null && currentFilename && annotations[currentFilename]) {
                    const ann = annotations[currentFilename][selectedAnnotationIndex];
                    if (ann) {
                         let x1 = Math.min(ann.x1, ann.x2);
                         let y1 = Math.min(ann.y1, ann.y2);
                         let x2 = Math.max(ann.x1, ann.x2);
                         let y2 = Math.max(ann.y1, ann.y2);
                         const dims = imageDimensionsCache[currentFilename];
                         if (dims) { // Clamp to boundaries
                             x1 = Math.max(0, x1);
                             y1 = Math.max(0, y1);
                             x2 = Math.min(dims.w, x2);
                             y2 = Math.min(dims.h, y2);
                         }
                         // Only update if size is valid
                         if (x2 > x1 && y2 > y1) {
                              ann.x1 = x1; ann.y1 = y1; ann.x2 = x2; ann.y2 = y2;
                              setStatus(`Anotação ${selectedAnnotationIndex} redimensionada.`);
                         } else {
                              // Maybe revert or delete? For now, just log and keep invalid state briefly.
                              console.warn("Resize resulted in invalid box dimensions.");
                              setStatus(`Erro: Redimensionamento resultou em caixa inválida.`);
                         }
                    } else {
                        console.error("Erro ao finalizar redimensionamento: anotação não encontrada.");
                        selectAnnotation(null);
                    }
                }
                break;

            case 'move':
                 if (selectedAnnotationIndex !== null && currentFilename && annotations[currentFilename]) {
                     const ann = annotations[currentFilename][selectedAnnotationIndex];
                     const dims = imageDimensionsCache[currentFilename];
                     if (ann && dims) {
                         const width = ann.x2 - ann.x1;
                         const height = ann.y2 - ann.y1;
                         // Clamp top-left corner first
                         ann.x1 = Math.max(0, Math.min(dims.w - width, ann.x1));
                         ann.y1 = Math.max(0, Math.min(dims.h - height, ann.y1));
                         // Recalculate bottom-right based on clamped top-left
                         ann.x2 = ann.x1 + width;
                         ann.y2 = ann.y1 + height;
                     }
                 }
                 setStatus(`Anotação ${selectedAnnotationIndex} movida.`);
                 break;
            case 'pan':
                 if(currentFilename) setStatus(`Exibindo ${currentFilename} (${currentImageIndex + 1}/${imageFiles.length})`);
                 break;
            case 'select':
                 if(selectedAnnotationIndex !== null) setStatus(`Anotação ${selectedAnnotationIndex} selecionada.`);
                 break;
        }

        interactionState.isDragging = false;
        interactionState.mode = null;
        interactionState.resizeHandle = null;
        resetInteractionCoords();
        updateCursorBasedOnMode();
        redrawAll();
        updateAnnotationList();
        updateUIState();
    }

     function onMouseLeave(event) {
        if (interactionState.isDragging) {
             console.log("Mouse deixou o canvas durante o arraste, simulando mouseup.");
             onMouseUp(event);
        }
        setCanvasCursor('default');
     }

     function onDoubleClick(event) {
        if (!originalImage || event.button !== 0) return;

        const coords = getMouseCanvasCoords(event);
        const clickedIndex = getAnnotationAtCoords(coords.x, coords.y);

        if (clickedIndex !== null && clickedIndex === selectedAnnotationIndex) {
            const currentFilename = imageFiles[currentImageIndex]?.name;
            const currentAnns = annotations[currentFilename] || [];
            const ann = currentAnns[selectedAnnotationIndex];

            if (ann) {
                const newLabel = prompt(`Editar classe (atual: ${ann.label}):`, ann.label);

                if (newLabel !== null) {
                     const trimmedLabel = newLabel.trim().toLowerCase();

                     if (trimmedLabel === "") {
                         alert("Erro: Nome da classe não pode ser vazio.");
                         return;
                     }
                     if (!knownClasses.has(trimmedLabel)) {
                         alert(`Erro: Classe '${trimmedLabel}' não é válida. Use uma da lista.`);
                         return;
                     }

                    let otherAnnHasNewLabel = false;
                    for (let i = 0; i < currentAnns.length; i++) {
                        if (i !== selectedAnnotationIndex && currentAnns[i].label === trimmedLabel) {
                            otherAnnHasNewLabel = true;
                            break;
                        }
                    }

                    if (otherAnnHasNewLabel) {
                        alert(`Erro: Classe '${trimmedLabel}' já existe em outra anotação nesta imagem.`);
                    } else if (trimmedLabel !== ann.label) {
                        ann.label = trimmedLabel;
                        redrawAll();
                        updateAnnotationList();
                        setStatus(`Classe da anotação ${selectedAnnotationIndex} alterada para '${trimmedLabel}'`);
                    }
                }
            }
        }
     }

    // --- Annotation Manipulation Helpers ---
    function getAnnotationAtCoords(cx, cy) { // cx, cy are internal canvas coords
        const currentFilename = imageFiles[currentImageIndex]?.name;
        if (!currentFilename || !annotations[currentFilename]) return null;
        const currentAnns = annotations[currentFilename];

        for (let i = currentAnns.length - 1; i >= 0; i--) {
            const ann = currentAnns[i];
            const c1 = imageToCanvasCoords(ann.x1, ann.y1); // Internal coords
            const c2 = imageToCanvasCoords(ann.x2, ann.y2);
            const xmin = Math.min(c1.x, c2.x);
            const ymin = Math.min(c1.y, c2.y);
            const xmax = Math.max(c1.x, c2.x);
            const ymax = Math.max(c1.y, c2.y);

            if (cx >= xmin && cx <= xmax && cy >= ymin && cy <= ymax) {
                return i;
            }
        }
        return null;
    }

    function getHandleAtCoords(cx, cy) { // cx, cy are internal canvas coords
        const currentFilename = imageFiles[currentImageIndex]?.name;
        if (selectedAnnotationIndex === null || !currentFilename || !annotations[currentFilename]) return null;
        const ann = annotations[currentFilename][selectedAnnotationIndex];
        if (!ann) return null;

        const c1 = imageToCanvasCoords(ann.x1, ann.y1);
        const c2 = imageToCanvasCoords(ann.x2, ann.y2);
        const xmin = Math.min(c1.x, c2.x);
        const ymin = Math.min(c1.y, c2.y);
        const xmax = Math.max(c1.x, c2.x);
        const ymax = Math.max(c1.y, c2.y);

        const dpr = window.devicePixelRatio || 1;
        const hitArea = (HANDLE_SIZE / 2 + HANDLE_HIT_TOLERANCE) * dpr; // Hit area in internal coords

        if (Math.abs(cx - xmin) < hitArea && Math.abs(cy - ymin) < hitArea) return 'nw';
        if (Math.abs(cx - xmax) < hitArea && Math.abs(cy - ymin) < hitArea) return 'ne';
        if (Math.abs(cx - xmin) < hitArea && Math.abs(cy - ymax) < hitArea) return 'sw';
        if (Math.abs(cx - xmax) < hitArea && Math.abs(cy - ymax) < hitArea) return 'se';

        return null;
    }

     function getResizeCursor(handleTag) {
         return handleTag === 'nw' || handleTag === 'se' ? 'nwse-resize' : 'nesw-resize';
     }

     function updateCursorOnHover(event) {
         if (!originalImage || interactionState.isDragging) return;

         const coords = getMouseCanvasCoords(event); // Internal coords
         const handle = getHandleAtCoords(coords.x, coords.y);
         if (handle) {
             setCanvasCursor(getResizeCursor(handle));
             return;
         }
         const annIndex = getAnnotationAtCoords(coords.x, coords.y);
         if (annIndex !== null) {
              setCanvasCursor('move');
             return;
         }
         if (isDrawingEnabled) {
             setCanvasCursor('crosshair');
             return;
         }
         setCanvasCursor('grab');
     }

     function updateCursorBasedOnMode() {
        if (interactionState.isDragging) return; // Cursor already set during drag
        setCanvasCursor(isDrawingEnabled ? 'crosshair' : 'grab');
     }

    function resizeAnnotation(canvasX, canvasY) { // canvasX/Y are internal coords
        const currentFilename = imageFiles[currentImageIndex]?.name;
        if (selectedAnnotationIndex === null || !interactionState.resizeHandle || !annotations[currentFilename]) return;
        const ann = annotations[currentFilename][selectedAnnotationIndex];
        if (!ann) return;

        const imgCoords = canvasToImageCoords(canvasX, canvasY); // Convert internal canvas coords to image coords

        switch (interactionState.resizeHandle) {
            case 'nw': ann.x1 = imgCoords.x; ann.y1 = imgCoords.y; break;
            case 'ne': ann.x2 = imgCoords.x; ann.y1 = imgCoords.y; break;
            case 'sw': ann.x1 = imgCoords.x; ann.y2 = imgCoords.y; break;
            case 'se': ann.x2 = imgCoords.x; ann.y2 = imgCoords.y; break;
        }
    }

    function moveAnnotation(deltaCanvasX, deltaCanvasY) { // Deltas are internal canvas coords
        const currentFilename = imageFiles[currentImageIndex]?.name;
        if (selectedAnnotationIndex === null || !annotations[currentFilename]) return;
        const ann = annotations[currentFilename][selectedAnnotationIndex];
        if (!ann) return;

        const deltaImgX = deltaCanvasX / scale; // Convert internal delta to image delta
        const deltaImgY = deltaCanvasY / scale;

        ann.x1 += deltaImgX;
        ann.y1 += deltaImgY;
        ann.x2 += deltaImgX;
        ann.y2 += deltaImgY;
    }

    function deleteSelectedAnnotation() {
        const currentFilename = imageFiles[currentImageIndex]?.name;
        if (selectedAnnotationIndex !== null && currentFilename && annotations[currentFilename]) {
            const deletedAnn = annotations[currentFilename].splice(selectedAnnotationIndex, 1)[0];
            setStatus(`Anotação ${selectedAnnotationIndex} ('${deletedAnn?.label || 'N/A'}') deletada.`);
            selectAnnotation(null);
            redrawAll();
            updateAnnotationList();
            updateUIState();
        } else {
            setStatus("Nenhuma anotação selecionada para deletar.");
        }
    }

    function selectAnnotation(index) {
        if (selectedAnnotationIndex === index) return;
        selectedAnnotationIndex = index;

        const listItems = annotationListUl.getElementsByTagName('li');
        for (let i = 0; i < listItems.length; i++) {
            const itemIndex = parseInt(listItems[i].dataset.index, 10);
             listItems[i].classList.toggle('selected', itemIndex === index);
        }
        redrawAll();
        updateUIState();
    }

    function updateAnnotationList() {
        annotationListUl.innerHTML = '';
        const currentFilename = imageFiles[currentImageIndex]?.name;

        if (currentImageIndex === -1 || !currentFilename) {
             const li = document.createElement('li');
             li.textContent = 'Abra ou adicione imagens.';
             li.style.fontStyle = 'italic'; li.style.color = '#888';
             annotationListUl.appendChild(li);
             return;
        }

        const currentAnns = annotations[currentFilename] || [];

        if (currentAnns.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Nenhuma anotação para esta imagem.';
            li.style.fontStyle = 'italic'; li.style.color = '#888';
            annotationListUl.appendChild(li);
            return;
        }

        currentAnns.forEach((ann, index) => {
            const li = document.createElement('li');
            li.textContent = `${index}: ${ann.label} (${Math.round(ann.x1)},${Math.round(ann.y1)})-(${Math.round(ann.x2)},${Math.round(ann.y2)})`;
            li.dataset.index = index;
            li.classList.toggle('selected', index === selectedAnnotationIndex);
            li.addEventListener('click', () => {
                 selectAnnotation(index);
                 setStatus(`Anotação ${index} ('${ann.label}') selecionada.`);
            });
            annotationListUl.appendChild(li);
        });
    }

    // --- UI State ---
    function updateUIState() {
        const hasImages = imageFiles.length > 0;
        const hasCurrent = currentImageIndex !== -1 && originalImage;
        const currentFilename = hasCurrent ? imageFiles[currentImageIndex].name : null;
        const hasAnnotationsForCurrent = hasCurrent && annotations[currentFilename]?.length > 0;
        const hasAnyAnnotations = Object.keys(annotations).some(key => annotations[key]?.length > 0);

        // Enable/disable buttons based on state
        prevImageBtn.disabled = !hasImages || currentImageIndex <= 0;
        nextImageBtn.disabled = !hasImages || currentImageIndex >= imageFiles.length - 1;
        addImageBtn.disabled = false; // Can always add more
        loadAnnotationsBtn.disabled = !hasImages; // Need images to load annotations for
        zoomInBtn.disabled = !hasCurrent || scale >= MAX_ZOOM;
        zoomOutBtn.disabled = !hasCurrent || scale <= MIN_ZOOM;
        saveAnnotationsBtn.disabled = !hasImages || !hasAnyAnnotations;
        saveCropsBtn.disabled = !hasCurrent || !hasAnnotationsForCurrent;
        cropFormatSelect.disabled = saveCropsBtn.disabled;
        deleteBtn.disabled = !hasCurrent || selectedAnnotationIndex === null;
        drawModeBtn.disabled = !hasCurrent;
        classSelect.disabled = !hasCurrent || knownClasses.size === 0;

        // Image info display
        if (hasCurrent) {
            imageInfoSpan.textContent = `${currentFilename} (${currentImageIndex + 1}/${imageFiles.length}) Z:${scale.toFixed(2)}x`;
        } else {
            imageInfoSpan.textContent = "Sem Imagem";
        }

        // Draw button appearance
        drawModeBtn.classList.toggle('active', isDrawingEnabled);
        drawModeBtn.textContent = isDrawingEnabled ? 'Desenhar Caixa [ON]' : 'Desenhar Caixa [OFF]';

        // Update cursor based on state if not dragging
        if (!interactionState.isDragging) updateCursorBasedOnMode();
    }

    function toggleDrawMode() {
        if (currentImageIndex === -1) return;
        isDrawingEnabled = !isDrawingEnabled;
        selectAnnotation(null);
        interactionState.mode = null;
        updateUIState();
        setStatus(isDrawingEnabled ? "Modo Desenho ativado." : "Modo Desenho desativado.");
    }

    function setStatus(message) {
        statusBar.textContent = message;
    }

    // --- Keyboard Shortcuts ---
    function handleKeyDown(event) {
        const targetTagName = event.target.tagName.toUpperCase();
        if (targetTagName === 'INPUT' || targetTagName === 'SELECT' || targetTagName === 'TEXTAREA') return;

        const isCtrlOrMeta = event.ctrlKey || event.metaKey; // Check Ctrl or Cmd
        const isAlt = event.altKey;
        const key = event.key;

        // Allow combinations only for save (Ctrl+S)
        if ((isCtrlOrMeta || isAlt) && !(isCtrlOrMeta && (key === 's' || key === 'S'))) return;

        let handled = false;
        switch (key) {
            case 'ArrowLeft':
            case 'a': case 'A':
                if (!prevImageBtn.disabled) { prevImage(); handled = true; } break;
            case 'ArrowRight':
            case 'd': case 'D':
                 if (!nextImageBtn.disabled) { nextImage(); handled = true; } break;
            case 'Delete': case 'Backspace':
                 if (!deleteBtn.disabled) { deleteSelectedAnnotation(); handled = true; } break;
            case '+': case '=':
                if (!zoomInBtn.disabled) { zoomIn(); handled = true; } break;
            case '-': case '_':
                if (!zoomOutBtn.disabled) { zoomOut(); handled = true; } break;
             case 'w': case 'W': // Toggle Draw
                 if (!drawModeBtn.disabled) { toggleDrawMode(); handled = true; } break;
             case 'Escape':
                 if (interactionState.isDragging && interactionState.mode === 'draw') {
                     interactionState.isDragging = false; interactionState.mode = null;
                     resetInteractionCoords(); setStatus("Desenho cancelado.");
                     redrawAll(); updateCursorBasedOnMode(); handled = true;
                 } else if (selectedAnnotationIndex !== null) {
                     selectAnnotation(null); setStatus("Anotação deselecionada."); handled = true;
                 } else if (isDrawingEnabled) {
                      toggleDrawMode(); handled = true;
                 }
                 break;
            case 's': case 'S': // Save Annotations (Ctrl+S)
                if (isCtrlOrMeta) {
                    if (!saveAnnotationsBtn.disabled) { saveYoloAnnotations(); handled = true; }
                    else { setStatus("Nada para salvar."); }
                }
                break;
        }
        if (handled) event.preventDefault();
    }

    // --- Saving Functionality ---
    function triggerDownload(blob, filename) {
        const useTimeout = typeof JSZip === 'undefined'; // Use delay only if JSZip missing
        const delay = useTimeout ? 100 : 0;

        setTimeout(() => {
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = filename;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
        }, delay);
    }

    function formatYoloLine(imgWidth, imgHeight, box, classList) {
        const xmin = Math.min(box.x1, box.x2); const ymin = Math.min(box.y1, box.y2);
        const xmax = Math.max(box.x1, box.x2); const ymax = Math.max(box.y1, box.y2);
        const label = box.label;
        try {
            const classIndex = classList.indexOf(label);
            if (classIndex === -1) throw new Error(`Classe '${label}' não encontrada`);
            if (imgWidth <= 0 || imgHeight <= 0) throw new Error(`Dimensões inválidas W=${imgWidth}, H=${imgHeight}`);

            const dw = 1.0 / imgWidth; const dh = 1.0 / imgHeight;
            const x_center = (xmin + xmax) / 2.0; const y_center = (ymin + ymax) / 2.0;
            const width = xmax - xmin; const height = ymax - ymin;

            const x_center_norm = Math.max(0.0, Math.min(1.0, x_center * dw));
            const y_center_norm = Math.max(0.0, Math.min(1.0, y_center * dh));
            const width_norm = Math.max(0.0, Math.min(1.0, width * dw));
            const height_norm = Math.max(0.0, Math.min(1.0, height * dh));

            if (width_norm <= 1e-6 || height_norm <= 1e-6) {
                console.warn(`YOLO: Dimensões normalizadas muito pequenas para '${label}'. Linha gerada.`);
            }
            return `${classIndex} ${x_center_norm.toFixed(6)} ${y_center_norm.toFixed(6)} ${width_norm.toFixed(6)} ${height_norm.toFixed(6)}`;
        } catch (e) {
            console.error(`Erro formato YOLO para '${label}':`, e);
            setStatus(`Erro ao formatar YOLO para '${label}'. Ver console.`);
            return null;
        }
    }
// --- Helper Functions for Saving ---

    // (formatYoloLine function already exists)

    function escapeXml(unsafe) {
        // Escapa caracteres especiais para XML
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
            return c; // Should not be reached with this regex
        });
    }

    function createPascalVocXml(imgFilename, imgWidth, imgHeight, boxes) {
        // Cria o conteúdo de um arquivo XML no formato Pascal VOC
        let xml = `<annotation>\n`;
        xml += `\t<folder>unknown</folder>\n`;
        xml += `\t<filename>${escapeXml(imgFilename)}</filename>\n`;
        // Poderia adicionar <path> se disponível, mas é complexo no cliente
        xml += `\t<source>\n\t\t<database>Unknown</database>\n\t</source>\n`;
        xml += `\t<size>\n`;
        xml += `\t\t<width>${Math.round(imgWidth)}</width>\n`;
        xml += `\t\t<height>${Math.round(imgHeight)}</height>\n`;
        xml += `\t\t<depth>3</depth>\n`; // Assume 3 canais (RGB)
        xml += `\t</size>\n`;
        xml += `\t<segmented>0</segmented>\n`; // Assume não segmentado

        boxes.forEach(box => {
            // Garante ordem e arredonda coordenadas
            const xmin = Math.round(Math.min(box.x1, box.x2));
            const ymin = Math.round(Math.min(box.y1, box.y2));
            const xmax = Math.round(Math.max(box.x1, box.x2));
            const ymax = Math.round(Math.max(box.y1, box.y2));
            const label = escapeXml(box.label);

             // Pula caixas inválidas (sem tamanho)
             if (xmin >= xmax || ymin >= ymax) {
                 console.warn(`Pulando caixa inválida para '${label}' no XML VOC de ${imgFilename}`);
                 return; // Continua para o próximo box
             }

            xml += `\t<object>\n`;
            xml += `\t\t<name>${label}</name>\n`;
            xml += `\t\t<pose>Unspecified</pose>\n`;
            xml += `\t\t<truncated>0</truncated>\n`;
            xml += `\t\t<difficult>0</difficult>\n`;
            xml += `\t\t<bndbox>\n`;
            xml += `\t\t\t<xmin>${xmin}</xmin>\n`;
            xml += `\t\t\t<ymin>${ymin}</ymin>\n`;
            xml += `\t\t\t<xmax>${xmax}</xmax>\n`;
            xml += `\t\t\t<ymax>${ymax}</ymax>\n`;
            xml += `\t\t</bndbox>\n`;
            xml += `\t</object>\n`;
        });

        xml += `</annotation>`;
        return xml;
    }

    // Função Principal para Salvar Anotações (Formatos YOLO e VOC)
    async function saveAllAnnotations() { // Nome da função alterado
        const hasAnyAnns = Object.values(annotations).some(anns => anns?.length > 0);
        if (!hasAnyAnns) {
            alert("Não há anotações para salvar."); return;
        }
        const useZip = typeof JSZip !== 'undefined';
        if (!useZip && !confirm("JSZip não encontrado. Anotações (YOLO e VOC) serão baixadas individualmente. Continuar?")) {
            setStatus("Salvar cancelado."); return;
        }

        setStatus("Preparando anotações (YOLO & VOC)..."); // Mensagem atualizada
        const sortedClasses = Array.from(knownClasses).sort();
        if (sortedClasses.length === 0) {
            alert("Erro: Nenhuma classe definida."); setStatus("Erro: Sem classes."); return;
        }
        const classesTxtContent = sortedClasses.join('\n'); // Conteúdo para classes.txt (YOLO)

        // Objetos para guardar conteúdo dos arquivos
        const yoloFileContents = {}; // Para arquivos .txt (YOLO)
        const vocFileContents = {};  // *** NOVO: Para arquivos .xml (VOC) ***

        const promises = []; // Para esperar busca de dimensões

        for (const filename in annotations) {
            const boxes = annotations[filename];
            if (boxes?.length > 0) {
                const baseFilename = filename.replace(/\.[^/.]+$/, ""); // Nome sem extensão
                promises.push(
                    getImageDimensions(filename).then(dims => {
                        if (dims?.w > 0 && dims?.h > 0) {
                            // --- Gera YOLO ---
                            const yoloLines = boxes.map(box => formatYoloLine(dims.w, dims.h, box, sortedClasses))
                                               .filter(line => line !== null);
                            if (yoloLines.length > 0) {
                                yoloFileContents[`${baseFilename}.txt`] = yoloLines.join('\n');
                            } else {
                                console.warn(`Nenhuma linha YOLO válida gerada para ${filename}.`);
                            }

                            // --- *** NOVO: Gera VOC XML *** ---
                            try {
                                const vocXml = createPascalVocXml(filename, dims.w, dims.h, boxes);
                                if (vocXml) { // Verifica se o XML foi gerado (pode falhar se boxes forem inválidos)
                                     vocFileContents[`${baseFilename}.xml`] = vocXml;
                                } else {
                                     console.warn(`Nenhum conteúdo VOC XML gerado para ${filename} (talvez boxes inválidas).`);
                                }
                            } catch (xmlError) {
                                 console.error(`Erro ao gerar XML VOC para ${filename}:`, xmlError);
                                 setStatus(`Erro ao gerar XML para ${filename}.`);
                            }
                            // --- Fim da geração VOC ---

                        } else {
                            console.error(`Dimensões inválidas para ${filename}. Anotações não salvas.`);
                            setStatus(`Erro: Falha ao obter dimensões de ${filename}.`);
                        }
                    }).catch(dimError => { // Captura erro do getImageDimensions também
                         console.error(`Erro ao obter dimensões para ${filename}:`, dimError);
                         setStatus(`Erro ao obter dimensões de ${filename}.`);
                    })
                );
            }
        } // Fim do loop for..in

        // Espera todas as promessas (geração de conteúdo) terminarem
        try {
            await Promise.all(promises);
        } catch (error) {
            console.error("Erro processando anotações:", error);
            setStatus("Erro ao processar anotações. Ver console.");
            return;
        }

        // Verifica se algo foi realmente gerado
        const hasYoloFiles = Object.keys(yoloFileContents).length > 0 || !!classesTxtContent;
        const hasVocFiles = Object.keys(vocFileContents).length > 0;
        if (!hasYoloFiles && !hasVocFiles) {
             alert("Nenhuma anotação válida encontrada para salvar em nenhum formato.");
             setStatus("Nenhuma anotação válida para salvar.");
             return;
        }

        // --- Lógica de Salvamento (ZIP ou Individual) ---
        if (useZip) {
            setStatus("Criando ZIP com anotações (YOLO & VOC)..."); // Mensagem atualizada
            const zip = new JSZip();
            const yoloFolder = zip.folder("yolo_annotations"); // Pasta para YOLO
            const vocFolder = zip.folder("voc_annotations");   // Pasta para VOC

            // Adiciona arquivos YOLO
            if (classesTxtContent) yoloFolder.file("classes.txt", classesTxtContent);
            for (const txtFilename in yoloFileContents) {
                yoloFolder.file(txtFilename, yoloFileContents[txtFilename]);
            }

            // *** NOVO: Adiciona arquivos VOC ***
            for (const xmlFilename in vocFileContents) {
                vocFolder.file(xmlFilename, vocFileContents[xmlFilename]);
            }

            try {
                const content = await zip.generateAsync({ type: "blob" });
                triggerDownload(content, "image_annotations.zip"); // Nome do ZIP atualizado
                setStatus(`Anotações salvas em image_annotations.zip (YOLO & VOC).`); // Mensagem atualizada
            } catch (err) {
                console.error("Erro ao criar ZIP:", err);
                setStatus("Erro ao criar ZIP. Ver console.");
                alert("Erro ao gerar ZIP.");
            }
        } else {
            // Fallback: Downloads individuais
            setStatus("Iniciando downloads individuais (YOLO & VOC)..."); // Mensagem atualizada
            let yoloCount = 0;
            let vocCount = 0;

            // Download YOLO
            if (classesTxtContent) {
                triggerDownload(new Blob([classesTxtContent], { type: 'text/plain' }), "classes.txt");
                yoloCount++;
            }
            for (const txtFilename in yoloFileContents) {
                triggerDownload(new Blob([yoloFileContents[txtFilename]], { type: 'text/plain' }), txtFilename);
                yoloCount++;
            }

            // *** NOVO: Download VOC ***
            for (const xmlFilename in vocFileContents) {
                triggerDownload(new Blob([vocFileContents[xmlFilename]], { type: 'application/xml' }), xmlFilename); // MIME type correto
                vocCount++;
            }

            setStatus(`Downloads individuais iniciados (${yoloCount} YOLO, ${vocCount} VOC).`); // Mensagem atualizada
        }
    } // Fim da função saveAllAnnotations

    async function saveCrops() {
        const currentFilename = imageFiles[currentImageIndex]?.name;
        const boxes = annotations[currentFilename];
        if (!originalImage || !currentFilename || !boxes?.length > 0) {
            alert("Nenhuma anotação na imagem atual para criar crops."); setStatus("Sem anotações para crops."); return;
        }

        const selectedFormat = cropFormatSelect.value || 'png';
        const mimeTypeMap = {'png': 'image/png', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'gif': 'image/gif', 'bmp': 'image/bmp'};
        const mimeType = mimeTypeMap[selectedFormat] || 'image/png';
        const fileExtension = selectedFormat;

        const useZip = typeof JSZip !== 'undefined';
        if (!useZip && !confirm(`JSZip não encontrado. ${boxes.length} seções (${fileExtension}) serão baixadas individualmente. Continuar?`)) {
            setStatus("Salvar crops cancelado."); return;
        }

        setStatus(`Gerando crops (${fileExtension})...`);
        const baseFilename = currentFilename.replace(/\.[^/.]+$/, "");
        const cropPromises = [];
        const zip = useZip ? new JSZip() : null;
        const zipFolder = zip ? zip.folder(`${baseFilename}_crops`) : null;
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        boxes.forEach((box, index) => {
            const x = Math.round(Math.min(box.x1, box.x2)); const y = Math.round(Math.min(box.y1, box.y2));
            const w = Math.round(Math.abs(box.x2 - box.x1)); const h = Math.round(Math.abs(box.y2 - box.y1));
            const label = box.label.replace(/[^a-z0-9]/gi, '_');

            if (w <= 0 || h <= 0) { console.warn(`Pulando crop ${index} ('${label}') - W/H zero.`); return; }

            offscreenCanvas.width = w; offscreenCanvas.height = h;
            offscreenCtx.drawImage(originalImage, x, y, w, h, 0, 0, w, h);
            const cropFilename = `${baseFilename}_${label}_${index}.${fileExtension}`;

            cropPromises.push(new Promise((resolve, reject) => {
                offscreenCanvas.toBlob(blob => {
                    if (blob) {
                        if (zip && zipFolder) zipFolder.file(cropFilename, blob);
                        else triggerDownload(blob, cropFilename);
                        resolve();
                    } else { console.error(`Falha no toBlob para crop ${index}`); reject(new Error(`toBlob fail ${cropFilename}`)); }
                }, mimeType, 0.92);
            }));
        });

        try {
             await Promise.all(cropPromises);
             if (zip) {
                 setStatus("Criando ZIP crops...");
                 const content = await zip.generateAsync({ type: "blob" });
                 triggerDownload(content, `${baseFilename}_crops.zip`);
                 setStatus(`Crops salvos em ${baseFilename}_crops.zip.`);
             } else { setStatus(`Downloads individuais crops iniciados (${cropPromises.length}).`); }
        } catch(error) { console.error("Erro ao salvar crops:", error); setStatus("Erro ao salvar crops."); alert("Erro ao salvar crops."); }
    }

    // --- XML Parsing (for loading existing annotations) ---
    function handleAnnotationFiles(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        if (imageFiles.length === 0) {
            alert("Carregue imagens antes de carregar anotações XML.");
            setStatus("Carregue imagens primeiro.");
            annotationInput.value = null; return;
        }

        let loadedCount = 0, errorCount = 0;
        const filePromises = [];
        const newlyFoundClasses = new Set();
        setStatus(`Carregando ${files.length} arquivo(s) XML...`);

        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.xml')) { console.warn(`Pulando não-XML: ${file.name}`); continue; }

            filePromises.push(new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
                        const parseError = xmlDoc.getElementsByTagName("parsererror");
                        if (parseError.length > 0) throw new Error(`Erro parsing XML: ${parseError[0].textContent}`);

                        const filenameTag = xmlDoc.getElementsByTagName("filename")[0];
                        const imgFilenameFromXml = filenameTag ? filenameTag.textContent : null;
                        let targetImageFilename = null;

                        if (imgFilenameFromXml && imageFiles.some(f => f.name === imgFilenameFromXml)) {
                            targetImageFilename = imgFilenameFromXml;
                        } else {
                            const xmlBaseName = file.name.replace(/\.[^/.]+$/, "");
                            const foundImage = imageFiles.find(f => f.name.replace(/\.[^/.]+$/, "") === xmlBaseName);
                            if (foundImage) targetImageFilename = foundImage.name;
                        }

                        if (targetImageFilename) {
                            const boxes = parsePascalVoc(xmlDoc);
                            if (boxes === null) throw new Error("Erro ao parsear <object>s");

                            const existingAnns = annotations[targetImageFilename] || [];
                            const validBoxes = [];
                            let duplicateFoundInXml = false;
                            let duplicateFoundExisting = false;
                            const labelsInThisXml = new Set();

                            boxes.forEach(box => {
                                 if (existingAnns.some(ex => ex.label === box.label)) {
                                     console.warn(`XML Load: Classe '${box.label}' já existe na imagem ${targetImageFilename}. Ignorando de ${file.name}.`);
                                     duplicateFoundExisting = true;
                                 } else if (labelsInThisXml.has(box.label)) {
                                      console.warn(`XML Load: Classe '${box.label}' duplicada DENTRO de ${file.name}. Usando a primeira.`);
                                      duplicateFoundInXml = true;
                                 }
                                  else {
                                     validBoxes.push(box);
                                     labelsInThisXml.add(box.label);
                                     newlyFoundClasses.add(box.label);
                                 }
                            });

                            // Merge valid new boxes with existing ones
                            annotations[targetImageFilename] = [...existingAnns, ...validBoxes];
                            if (validBoxes.length > 0 || (!duplicateFoundInXml && !duplicateFoundExisting && boxes.length === 0)) {
                                loadedCount++; // Count if loaded anything or if XML was valid but empty without dupes
                            }
                             if(duplicateFoundExisting || duplicateFoundInXml) {
                                 setStatus(`Aviso: Classes duplicadas ignoradas ao carregar ${file.name}.`);
                             }
                        } else { console.warn(`Nenhuma imagem correspondente para anotação: ${file.name}`); }
                        resolve();
                    } catch (err) { console.error(`Erro processando ${file.name}:`, err); errorCount++; resolve(); }
                };
                reader.onerror = (err) => { console.error(`Erro lendo ${file.name}:`, err); errorCount++; resolve(); };
                reader.readAsText(file);
            }));
        }

        Promise.all(filePromises).then(() => {
            setStatus(`XMLs carregados. ${loadedCount} imagens atualizadas. Erros: ${errorCount}.`);
            newlyFoundClasses.forEach(cls => knownClasses.add(cls));
            if (newlyFoundClasses.size > 0) populateClassDropdown();
            if (currentImageIndex !== -1) { redrawAll(); updateAnnotationList(); updateUIState(); }
            annotationInput.value = null;
        });
    }

    function parsePascalVoc(xmlDoc) {
        const boxes = [];
        try {
            const objects = xmlDoc.getElementsByTagName("object");
            for (const obj of objects) {
                const nameElem = obj.getElementsByTagName("name")[0];
                const bndboxElem = obj.getElementsByTagName("bndbox")[0];
                if (!nameElem || !bndboxElem) continue;
                const label = nameElem.textContent.trim().toLowerCase();
                const xminElem = bndboxElem.getElementsByTagName("xmin")[0]; const yminElem = bndboxElem.getElementsByTagName("ymin")[0];
                const xmaxElem = bndboxElem.getElementsByTagName("xmax")[0]; const ymaxElem = bndboxElem.getElementsByTagName("ymax")[0];
                if (!label || !xminElem || !yminElem || !xmaxElem || !ymaxElem) continue;
                const xmin = parseFloat(xminElem.textContent); const ymin = parseFloat(yminElem.textContent);
                const xmax = parseFloat(xmaxElem.textContent); const ymax = parseFloat(ymaxElem.textContent);
                if ([xmin, ymin, xmax, ymax].some(isNaN)) continue;
                boxes.push({ x1: Math.min(xmin, xmax), y1: Math.min(ymin, ymax), x2: Math.max(xmin, xmax), y2: Math.max(ymin, ymax), label });
            }
            return boxes;
        } catch (e) { console.error("Erro parse Pascal VOC:", e); return null; }
    }

    // --- Start ---
    initialize();
});
document.addEventListener('DOMContentLoaded', () => {
    // Initialize canvas with full controls
    const canvas = new fabric.Canvas('designCanvas', {
        width: 800,
        height: 800,
        backgroundColor: '#2d2d2d',
        selection: true,
        preserveObjectStacking: true,
        fireMiddleClick: true,
        controlsAboveOverlay: true
    });

    // State management
    const state = {
        uploadedImage: null,
        activeControlsPanel: null,
        isPreviewMode: false,
        blendModes: [
            'normal', 'multiply', 'screen', 'overlay', 
            'darken', 'lighten', 'color-dodge', 'color-burn'
        ],
        previewImg: null
    };

    // --- Undo/Redo Implementation (NEW) ---
    // Snapshot-based, flexible, supports all canvas state
    const history = {
        stack: [],
        pointer: -1,
        max: 40
    };

    function snapshotState() {
        // Serialize canvas state (including custom props)
        const json = canvas.toDatalessJSON(['blendMode', 'originalSrc']);
        if (canvas.backgroundImage && canvas.backgroundImage.getSrc) {
            json.backgroundImageSrc = canvas.backgroundImage.getSrc();
        }
        return JSON.stringify(json);
    }

    function pushHistory() {
        // Remove redo states if any
        if (history.pointer < history.stack.length - 1) {
            history.stack = history.stack.slice(0, history.pointer + 1);
        }
        // Push new state
        const snap = snapshotState();
        if (history.stack.length && history.stack[history.pointer] === snap) return;
        history.stack.push(snap);
        if (history.stack.length > history.max) {
            history.stack.shift();
        } else {
            history.pointer++;
        }
        updateUndoRedoButtons();
    }

    function restoreHistory(idx) {
        if (idx < 0 || idx >= history.stack.length) return;
        const json = JSON.parse(history.stack[idx]);
        const bgSrc = json.backgroundImageSrc;
        delete json.backgroundImageSrc;
        canvas.loadFromJSON(json, () => {
            if (bgSrc) {
                fabric.Image.fromURL(bgSrc, function(img) {
                    const scale = Math.min(
                        canvas.width / img.width,
                        canvas.height / img.height
                    );
                    canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                        scaleX: scale,
                        scaleY: scale,
                        originX: 'center',
                        originY: 'center',
                        left: canvas.width/2,
                        top: canvas.height/2
                    });
                });
            } else {
                canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
            }
            canvas.renderAll();
            updateSizeBoxFromActive();
            if (!canvas.getActiveObject()) closeActiveControls();
            if (state.isPreviewMode) renderPreviewMode();
            updateUndoRedoButtons();
        });
    }

    function undo() {
        if (history.pointer > 0) {
            history.pointer--;
            restoreHistory(history.pointer);
        }
    }

    function redo() {
        if (history.pointer < history.stack.length - 1) {
            history.pointer++;
            restoreHistory(history.pointer);
        }
    }

    function updateUndoRedoButtons() {
        dom.undoBtn.disabled = history.pointer <= 0;
        dom.redoBtn.disabled = history.pointer >= history.stack.length - 1;
    }

    function setupHistoryListeners() {
        // Save on meaningful actions
        canvas.on('object:added', pushHistory);
        canvas.on('object:removed', pushHistory);
        canvas.on('object:modified', pushHistory);
        dom.mockupSelect.addEventListener('change', pushHistory);
    }

    function initHistory() {
        pushHistory();
        updateUndoRedoButtons();
    }

    // Add new DOM references
    const dom = {
        mockupSelect: document.getElementById('mockupSelect'),
        dropZone: document.getElementById('dropZone'),
        fileInput: document.getElementById('fileInput'),
        blendBtn: document.getElementById('blendBtn'),
        previewBtn: document.getElementById('previewBtn'),
        addImageBtn: document.getElementById('addImageBtn'),
        addImageInput: document.getElementById('addImageInput'),
        cropBtn: document.getElementById('cropBtn'),
        adjustBtn: document.getElementById('adjustBtn'),
        undoBtn: document.getElementById('undoBtn'),
        redoBtn: document.getElementById('redoBtn'),
        snapCenterBtn: document.getElementById('snapCenterBtn'),
        resetTransformBtn: document.getElementById('resetTransformBtn'),
        downloadBtn: document.getElementById('downloadBtn'),
        contextMenu: document.getElementById('contextMenu'),
        ctxDelete: document.getElementById('ctxDelete'),
        ctxDuplicate: document.getElementById('ctxDuplicate'),
        ctxFront: document.getElementById('ctxFront'),
        ctxBack: document.getElementById('ctxBack')
    };

    // Tambah referensi sizebox
    const sizeBox = {
        widthInput: document.getElementById('designWidth'),
        heightInput: document.getElementById('designHeight'),
        applyBtn: document.getElementById('applySizeBtn')
    };

    // Tambah referensi loading spinner & global notification
    const loadingSpinner = document.getElementById('canvasLoading');
    const globalNotif = document.getElementById('globalNotification');
    const canvasContainer = document.getElementById('canvasContainer');

    // Konstanta konversi cm ke px (canvas 800px = 130cm)
    const CM_TO_PX = 800 / 130; // ≈ 6.1538

    // Show/hide loading spinner
    function showLoading(msg = "Loading...") {
        if (!loadingSpinner) return;
        loadingSpinner.style.display = 'flex';
        loadingSpinner.querySelector('span').textContent = msg;
    }
    function hideLoading() {
        if (!loadingSpinner) return;
        loadingSpinner.style.display = 'none';
    }

    // Show global notification (top)
    function showGlobalNotif(msg, timeout = 2500) {
        if (!globalNotif) return;
        globalNotif.innerHTML = msg;
        globalNotif.style.display = 'block';
        setTimeout(() => {
            globalNotif.style.opacity = '1';
            globalNotif.style.transform = 'translateX(-50%) scale(1.04)';
        }, 30);
        setTimeout(() => {
            globalNotif.style.opacity = '0';
            globalNotif.style.transform = 'translateX(-50%) scale(0.98)';
            setTimeout(() => globalNotif.style.display = 'none', 350);
        }, timeout);
    }

    // Initialize application
    initEventListeners();
    loadMockup(dom.mockupSelect.value);

    // Event listeners setup
    function initEventListeners() {
        // Mockup selection
        dom.mockupSelect.addEventListener('change', (e) => loadMockup(e.target.value));

        // Drag and drop handling
        dom.dropZone.addEventListener('dragover', handleDragOver);
        dom.dropZone.addEventListener('dragleave', handleDragLeave);
        dom.dropZone.addEventListener('drop', handleDrop);
        dom.dropZone.addEventListener('click', () => dom.fileInput.click());
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.addImageBtn.addEventListener('click', () => dom.addImageInput.click());
        dom.addImageInput.addEventListener('change', handleAddImageSelect);

        // Toolbar buttons
        dom.blendBtn.addEventListener('click', openBlendControls);
        dom.previewBtn.addEventListener('click', togglePreview);
        dom.cropBtn.addEventListener('click', openCropModal);
        dom.adjustBtn.addEventListener('click', openAdjustControls);

        // Undo/Redo buttons
        dom.undoBtn.addEventListener('click', undo);
        dom.redoBtn.addEventListener('click', redo);

        // Sizebox apply
        sizeBox.applyBtn.addEventListener('click', applyManualSize);

        // Snap to center
        dom.snapCenterBtn.addEventListener('click', () => {
            const obj = canvas.getActiveObject();
            if (obj && obj instanceof fabric.Image) {
                obj.set({
                    left: canvas.width / 2 - (obj.getScaledWidth() / 2),
                    top: canvas.height / 2 - (obj.getScaledHeight() / 2)
                });
                obj.setCoords();
                canvas.renderAll();
                pushHistory();
            }
        });

        // Reset transform
        dom.resetTransformBtn.addEventListener('click', () => {
            const obj = canvas.getActiveObject();
            if (obj && obj instanceof fabric.Image) {
                obj.set({
                    scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0
                });
                obj.setCoords();
                canvas.renderAll();
                pushHistory();
            }
        });

        // Download PNG
        dom.downloadBtn.addEventListener('click', () => {
            const dataURL = canvas.toDataURL({ format: 'png', multiplier: 2 });
            const a = document.createElement('a');
            a.href = dataURL;
            const now = new Date();
            a.download = `tshirt-design-${now.getFullYear()}${(now.getMonth()+1)}${now.getDate()}-${now.getHours()}${now.getMinutes()}${now.getSeconds()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showGlobalNotif('Design downloaded!');
        });

        // Context menu
        canvas.on('mouse:down', function(opt) {
            if (opt.button === 3 && canvas.getActiveObject()) {
                showContextMenu(opt.e);
            } else {
                hideContextMenu();
            }
        });
        document.addEventListener('click', hideContextMenu);

        dom.ctxDelete.addEventListener('click', () => {
            const obj = canvas.getActiveObject();
            if (obj) {
                canvas.remove(obj);
                hideContextMenu();
                pushHistory();
                showGlobalNotif('Object deleted');
            }
        });
        dom.ctxDuplicate.addEventListener('click', () => {
            const obj = canvas.getActiveObject();
            if (obj && obj.clone) {
                obj.clone(clone => {
                    clone.set({ left: obj.left + 30, top: obj.top + 30 });
                    canvas.add(clone);
                    canvas.setActiveObject(clone);
                    canvas.renderAll();
                    hideContextMenu();
                    pushHistory();
                });
            }
        });
        dom.ctxFront.addEventListener('click', () => {
            const obj = canvas.getActiveObject();
            if (obj) {
                canvas.bringToFront(obj);
                canvas.renderAll();
                hideContextMenu();
                pushHistory();
            }
        });
        dom.ctxBack.addEventListener('click', () => {
            const obj = canvas.getActiveObject();
            if (obj) {
                canvas.sendToBack(obj);
                canvas.renderAll();
                hideContextMenu();
                pushHistory();
            }
        });

        // Make controls panel draggable
        document.addEventListener('mousedown', function(e) {
            if (state.activeControlsPanel && e.target.closest('.controls-panel')) {
                let panel = state.activeControlsPanel;
                let offsetX = e.clientX - panel.getBoundingClientRect().left;
                let offsetY = e.clientY - panel.getBoundingClientRect().top;
                panel.style.boxShadow = '0 8px 32px #6366f155, 0 2px 8px #6366f133';
                function moveHandler(ev) {
                    let left = ev.clientX - offsetX;
                    let top = ev.clientY - offsetY;
                    // Prevent out of viewport
                    left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
                    top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
                    panel.style.left = left + 'px';
                    panel.style.top = top + 'px';
                }
                function upHandler() {
                    panel.style.boxShadow = '0 8px 32px #6366f133';
                    document.removeEventListener('mousemove', moveHandler);
                    document.removeEventListener('mouseup', upHandler);
                }
                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('mouseup', upHandler);
            }
        });

        // Canvas events
        canvas.on('selection:created', () => {
            updateSizeBoxFromActive();
            updateActivePanel();
        });
        canvas.on('selection:updated', () => {
            updateSizeBoxFromActive();
            updateActivePanel();
        });
        canvas.on('selection:cleared', () => {
            clearSizeBox();
            closeActiveControls();
        });
        canvas.on('object:modified', () => {
            updateSizeBoxFromActive();
            updateActivePanel();
            canvas.renderAll();
            if (state.isPreviewMode) renderPreviewMode();
        });
        canvas.on('object:added', () => {
            updateSizeBoxFromActive();
            updateActivePanel();
        });
        canvas.on('object:removed', () => {
            updateSizeBoxFromActive();
            updateActivePanel();
        });

        // Keyboard shortcuts: ESC to close panel, DEL to delete object
        document.addEventListener('keydown', (e) => {
            if (e.key === "Escape") {
                closeActiveControls();
                hideContextMenu();
                canvas.discardActiveObject();
                canvas.renderAll();
            }
            if ((e.key === "Delete" || e.key === "Backspace") && canvas.getActiveObject()) {
                const obj = canvas.getActiveObject();
                if (obj && obj !== canvas.backgroundImage) {
                    canvas.remove(obj);
                    pushHistory();
                    showGlobalNotif('Object deleted');
                }
            }
        });

        // After every important action, focus canvas for accessibility
        [
            dom.undoBtn, dom.redoBtn, dom.downloadBtn, dom.addImageBtn, dom.cropBtn, dom.adjustBtn, dom.blendBtn
        ].forEach(btn => btn.addEventListener('click', focusCanvas));
    }

    // Context menu helpers (prevent out of viewport)
    function showContextMenu(e) {
        e.preventDefault();
        dom.contextMenu.style.display = 'block';
        let x = e.pageX, y = e.pageY;
        // Prevent overflow right/bottom
        const rect = dom.contextMenu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        dom.contextMenu.style.left = x + 'px';
        dom.contextMenu.style.top = y + 'px';
        dom.contextMenu.style.opacity = '0';
        dom.contextMenu.style.transform = 'scale(0.96)';
        setTimeout(() => {
            dom.contextMenu.style.opacity = '1';
            dom.contextMenu.style.transform = 'scale(1)';
        }, 10);
    }
    function hideContextMenu() {
        dom.contextMenu.style.opacity = '0';
        dom.contextMenu.style.transform = 'scale(0.96)';
        setTimeout(() => {
            dom.contextMenu.style.display = 'none';
        }, 120);
    }

    // Update panel jika objek aktif berubah
    function updateActivePanel() {
        if (!state.activeControlsPanel) return;
        // Jika panel blend mode terbuka, update highlight
        if (state.activeControlsPanel.querySelector('.blend-grid')) {
            const activeImg = canvas.getActiveObject();
            state.activeControlsPanel.querySelectorAll('.blend-option').forEach(btn => {
                btn.classList.toggle('active', activeImg && activeImg.blendMode === btn.dataset.mode);
            });
        }
        // Jika panel brightness/contrast terbuka, update slider
        if (state.activeControlsPanel.querySelector('#brightnessRange')) {
            const activeImg = canvas.getActiveObject();
            let brightnessVal = 0, contrastVal = 0;
            if (activeImg && activeImg.filters && activeImg.filters.length) {
                activeImg.filters.forEach(f => {
                    if (f.type === 'Brightness') brightnessVal = f.brightness;
                    if (f.type === 'Contrast') contrastVal = f.contrast;
                });
            }
            state.activeControlsPanel.querySelector('#brightnessRange').value = brightnessVal;
            state.activeControlsPanel.querySelector('#contrastRange').value = contrastVal;
        }
    }

    // Load mockup image (with spinner & error handling)
    function loadMockup(src) {
        showLoading("Loading mockup...");
        fabric.Image.fromURL(src, function(img) {
            hideLoading();
            if (!img) {
                showAlert('Failed to load mockup image');
                showGlobalNotif('Failed to load mockup image');
                return;
            }
            const scale = Math.min(
                canvas.width / img.width,
                canvas.height / img.height
            );
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                scaleX: scale,
                scaleY: scale,
                originX: 'center',
                originY: 'center',
                left: canvas.width/2,
                top: canvas.height/2
            });
        }, { crossOrigin: 'anonymous' });
    }

    // Handle image upload (with spinner)
    function handleImage(file) {
        if (!file.type.match('image.*')) {
            showAlert('Only image files are allowed');
            showGlobalNotif('Only image files are allowed');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showAlert('File size too large (max 5MB)');
            showGlobalNotif('File size too large (max 5MB)');
            return;
        }
        showLoading("Loading image...");
        const reader = new FileReader();
        reader.onload = (e) => {
            fabric.Image.fromURL(e.target.result, function(img) {
                hideLoading();
                img.originalSrc = e.target.result;
                if (!img) {
                    showAlert('Error loading your image');
                    showGlobalNotif('Error loading your image');
                    return;
                }
                if (state.uploadedImage) canvas.remove(state.uploadedImage);
                img.set({
                    hasControls: true,
                    hasBorders: true,
                    lockMovementX: false,
                    lockMovementY: false,
                    lockScalingX: false,
                    lockScalingY: false,
                    lockRotation: false,
                    lockSkewingX: false,
                    lockSkewingY: false,
                    cornerStyle: 'circle',
                    cornerColor: '#6366f1',
                    borderColor: '#6366f1',
                    transparentCorners: false,
                    cornerSize: 12,
                    padding: 10,
                    selectable: true,
                    evented: true
                });
                img.blendMode = 'normal';
                if (!img._originalRender) {
                    img._originalRender = img._render;
                    img._render = function(ctx) {
                        const prev = ctx.globalCompositeOperation;
                        ctx.globalCompositeOperation = (this.blendMode && this.blendMode !== 'normal') ? this.blendMode : 'source-over';
                        this._originalRender(ctx);
                        ctx.globalCompositeOperation = prev;
                    };
                }
                state.uploadedImage = img;
                img.scaleToWidth(300);
                canvas.add(img).centerObject(img).setActiveObject(img).renderAll();
                dom.dropZone.style.display = 'none';
                img.on('modified', () => {
                    updateSizeBoxFromActive();
                    updateActivePanel();
                    canvas.renderAll();
                    if (state.isPreviewMode) renderPreviewMode();
                });
                updateSizeBoxFromActive();
                updateActivePanel();
                pushHistory();
                showGlobalNotif('Image loaded!');
            }, { crossOrigin: 'anonymous' });
        };
        reader.readAsDataURL(file);
    }

    function addImage(file) {
        if (!file.type.match('image.*')) {
            showAlert('Only image files are allowed');
            showGlobalNotif('Only image files are allowed');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showAlert('File size too large (max 5MB)');
            showGlobalNotif('File size too large (max 5MB)');
            return;
        }
        showLoading("Adding image...");
        const reader = new FileReader();
        reader.onload = (e) => {
            fabric.Image.fromURL(e.target.result, function(img) {
                hideLoading();
                img.originalSrc = e.target.result;
                if (!img) {
                    showAlert('Error loading your image');
                    showGlobalNotif('Error loading your image');
                    return;
                }
                img.set({
                    hasControls: true,
                    hasBorders: true,
                    lockMovementX: false,
                    lockMovementY: false,
                    lockScalingX: false,
                    lockScalingY: false,
                    lockRotation: false,
                    lockSkewingX: false,
                    lockSkewingY: false,
                    cornerStyle: 'circle',
                    cornerColor: '#6366f1',
                    borderColor: '#6366f1',
                    transparentCorners: false,
                    cornerSize: 12,
                    padding: 10,
                    selectable: true,
                    evented: true
                });
                img.blendMode = 'normal';
                if (!img._originalRender) {
                    img._originalRender = img._render;
                    img._render = function(ctx) {
                        const prev = ctx.globalCompositeOperation;
                        ctx.globalCompositeOperation = (this.blendMode && this.blendMode !== 'normal') ? this.blendMode : 'source-over';
                        this._originalRender(ctx);
                        ctx.globalCompositeOperation = prev;
                    };
                }
                img.scaleToWidth(200);
                canvas.add(img).centerObject(img).setActiveObject(img).renderAll();
                img.on('modified', () => {
                    updateSizeBoxFromActive();
                    updateActivePanel();
                    canvas.renderAll();
                    if (state.isPreviewMode) renderPreviewMode();
                });
                updateSizeBoxFromActive();
                updateActivePanel();
                pushHistory();
                showGlobalNotif('Image added!');
            }, { crossOrigin: 'anonymous' });
        };
        reader.readAsDataURL(file);
    }

    // Add image feature
    function handleAddImageSelect(e) {
        if (e.target.files[0]) addImage(e.target.files[0]);
    }

    // Blend mode controls
    function openBlendControls() {
        const activeImg = canvas.getActiveObject();
        if (!activeImg || !(activeImg instanceof fabric.Image)) return showAlert('Please select an image first');
        closeActiveControls();

        const panel = document.createElement('div');
        panel.className = 'controls-panel';
        panel.innerHTML = `
            <button class="close-btn">&times;</button>
            <h3>Blend Mode</h3>
            <div class="blend-grid">
                ${state.blendModes.map(mode => `
                    <button class="blend-option ${activeImg.blendMode === mode ? 'active' : ''}" 
                            data-mode="${mode}">
                        ${mode.replace('-', ' ')}
                    </button>
                `).join('')}
            </div>
            <button class="reset-btn">Reset Blend Mode</button>
        `;

        document.querySelector('.canvas-container').appendChild(panel);
        state.activeControlsPanel = panel;

        // Blend mode selection
        panel.querySelectorAll('.blend-option').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                activeImg.blendMode = btn.dataset.mode; // set custom property
                canvas.renderAll();
                if (state.isPreviewMode) renderPreviewMode();
                pushHistory();
            });
        });

        // Reset button
        panel.querySelector('.reset-btn').addEventListener('click', () => {
            activeImg.blendMode = 'normal';
            panel.querySelector('.active')?.classList.remove('active');
            panel.querySelector('[data-mode="normal"]').classList.add('active');
            canvas.renderAll();
            if (state.isPreviewMode) renderPreviewMode();
            pushHistory();
        });

        // Close button
        panel.querySelector('.close-btn').addEventListener('click', closeActiveControls);
    }

    // --- Ganti crop: Modal Cropper.js ---
    // SEDERHANAKAN crop modal: hanya crop box, handles, OK/Cancel
    function openCropModal() {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || !(activeObj instanceof fabric.Image)) {
            showAlert('Please select an image first');
            return;
        }
        // Ambil modal dan elemen terkait
        const cropModal = document.querySelector('.crop-modal');
        const cropImage = document.getElementById('cropImage');
        // Sembunyikan semua control di modal kecuali gambar dan footer
        const aspectRatioSelect = cropModal.querySelector('.aspect-ratio-select');
        if (aspectRatioSelect) aspectRatioSelect.style.display = 'none';
        const cropRotateBtn = cropModal.querySelector('.crop-rotate-btn');
        if (cropRotateBtn) cropRotateBtn.style.display = 'none';
        const cropFlipHBtn = cropModal.querySelector('.crop-flip-h-btn');
        if (cropFlipHBtn) cropFlipHBtn.style.display = 'none';
        const cropFlipVBtn = cropModal.querySelector('.crop-flip-v-btn');
        if (cropFlipVBtn) cropFlipVBtn.style.display = 'none';

        const closeBtn = cropModal.querySelector('.crop-close-btn');
        const cancelBtn = cropModal.querySelector('.crop-cancel-btn');
        const applyBtn = cropModal.querySelector('.crop-apply-btn');

        // Set gambar sumber (ambil originalSrc jika ada)
        cropImage.src = activeObj.originalSrc || activeObj._element.src;
        cropImage.style.maxWidth = '100%';
        cropImage.style.maxHeight = '60vh';

        let cropper = null;
        let aspectLocked = false;

        // Tampilkan modal
        cropModal.style.display = 'flex';
        setTimeout(() => cropModal.classList.add('show'), 10);

        // Inisialisasi Cropper.js setelah gambar siap
        cropImage.onload = () => {
            if (cropper) cropper.destroy();
            cropper = new Cropper(cropImage, {
                viewMode: 1,
                autoCropArea: 1,
                aspectRatio: aspectLocked ? cropImage.naturalWidth / cropImage.naturalHeight : NaN,
                background: false,
                movable: true,
                zoomable: true,
                rotatable: false,
                scalable: false,
                responsive: true,
                guides: true,
                center: true,
                highlight: true,
                cropBoxMovable: true,
                cropBoxResizable: true,
                dragMode: 'crop'
            });
        };

        // Lock aspect ratio with Shift
        cropModal.onkeydown = (ev) => {
            if (ev.key === "Shift" && cropper) {
                aspectLocked = true;
                cropper.setAspectRatio(cropImage.naturalWidth / cropImage.naturalHeight);
            }
        };
        cropModal.onkeyup = (ev) => {
            if (ev.key === "Shift" && cropper) {
                aspectLocked = false;
                cropper.setAspectRatio(NaN);
            }
        };

        // Close/cancel
        function closeModal() {
            cropModal.classList.remove('show');
            setTimeout(() => { cropModal.style.display = 'none'; }, 250);
            if (cropper) { cropper.destroy(); cropper = null; }
            // Kembalikan kontrol modal jika dibuka lagi
            if (aspectRatioSelect) aspectRatioSelect.style.display = '';
            if (cropRotateBtn) cropRotateBtn.style.display = '';
            if (cropFlipHBtn) cropFlipHBtn.style.display = '';
            if (cropFlipVBtn) cropFlipVBtn.style.display = '';
        }
        closeBtn.onclick = cancelBtn.onclick = closeModal;

        // Apply crop
        applyBtn.onclick = () => {
            const croppedCanvas = cropper.getCroppedCanvas();
            if (!croppedCanvas) return;
            const croppedDataUrl = croppedCanvas.toDataURL('image/png');
            // Simpan properti lama
            const oldProps = {
                left: activeObj.left,
                top: activeObj.top,
                angle: 0, // reset rotasi, sudah diterapkan di cropper
                blendMode: activeObj.blendMode,
                scaleX: 1,
                scaleY: 1
            };
            // Ambil ukuran lama dalam cm (jika ada)
            let widthCm = null, heightCm = null;
            try {
                widthCm = Math.round((activeObj.width * activeObj.scaleX) / CM_TO_PX * 100) / 100;
                heightCm = Math.round((activeObj.height * activeObj.scaleY) / CM_TO_PX * 100) / 100;
            } catch {}
            canvas.remove(activeObj);
            fabric.Image.fromURL(croppedDataUrl, function(newImg) {
                newImg.set({
                    ...oldProps,
                    hasControls: true,
                    hasBorders: true,
                    cornerStyle: 'circle',
                    cornerColor: '#6366f1',
                    borderColor: '#6366f1',
                    transparentCorners: false,
                    cornerSize: 12,
                    padding: 10,
                    selectable: true,
                    evented: true
                });
                newImg.originalSrc = croppedDataUrl;
                if (oldProps.blendMode) {
                    newImg.blendMode = oldProps.blendMode;
                    if (!newImg._originalRender) {
                        newImg._originalRender = newImg._render;
                        newImg._render = function(ctx) {
                            const prev = ctx.globalCompositeOperation;
                            ctx.globalCompositeOperation = (this.blendMode && this.blendMode !== 'normal') ? this.blendMode : 'source-over';
                            this._originalRender(ctx);
                            ctx.globalCompositeOperation = prev;
                        };
                    }
                }
                // Jika sebelumnya sudah diatur ukuran cm, terapkan ke gambar baru
                if (widthCm && heightCm) {
                    newImg.set({
                        scaleX: (widthCm * CM_TO_PX) / newImg.width,
                        scaleY: (heightCm * CM_TO_PX) / newImg.height
                    });
                }
                canvas.add(newImg);
                canvas.setActiveObject(newImg);
                canvas.renderAll();
                updateSizeBoxFromActive();
                updateActivePanel();
                if (state.isPreviewMode) renderPreviewMode();
                pushHistory();
            }, { crossOrigin: 'anonymous' });
            closeModal();
        };
    }

    // Brightness & Contrast controls (NEW: stable, filter array fixed order)
    function openAdjustControls() {
        const activeImg = canvas.getActiveObject();
        if (!activeImg || !(activeImg instanceof fabric.Image)) return showAlert('Pilih gambar terlebih dahulu');
        closeActiveControls();

        const panel = document.createElement('div');
        panel.className = 'controls-panel';
        panel.innerHTML = `
            <button class="close-btn">&times;</button>
            <h3>Brightness & Contrast</h3>
            <div class="adjustment-controls">
                <div class="adjust-group">
                    <label>Brightness</label>
                    <input type="range" id="brightnessRange" min="-1" max="1" step="0.05" value="0">
                </div>
                <div class="adjust-group">
                    <label>Contrast</label>
                    <input type="range" id="contrastRange" min="-1" max="1" step="0.05" value="0">
                </div>
                <button class="reset-btn">Reset Adjustments</button>
            </div>
        `;

        document.querySelector('.canvas-container').appendChild(panel);
        state.activeControlsPanel = panel;

        // Ensure only one brightness and one contrast filter
        function ensureFilters() {
            let bIdx = -1, cIdx = -1;
            activeImg.filters.forEach((f, i) => {
                if (f.type === 'Brightness') bIdx = i;
                if (f.type === 'Contrast') cIdx = i;
            });
            if (bIdx === -1) {
                activeImg.filters.unshift(new fabric.Image.filters.Brightness({ brightness: 0 }));
                bIdx = 0;
            }
            if (cIdx === -1) {
                activeImg.filters.splice(1, 0, new fabric.Image.filters.Contrast({ contrast: 0 }));
                cIdx = 1;
            }
            // Remove duplicate filters
            activeImg.filters = activeImg.filters.filter((f, i, arr) =>
                (f.type !== 'Brightness' || i === bIdx) &&
                (f.type !== 'Contrast' || i === cIdx)
            );
        }
        ensureFilters();

        // Set slider values from filter
        panel.querySelector('#brightnessRange').value = activeImg.filters[0].brightness || 0;
        panel.querySelector('#contrastRange').value = activeImg.filters[1].contrast || 0;

        function updateFilters() {
            activeImg.filters[0].brightness = parseFloat(panel.querySelector('#brightnessRange').value);
            activeImg.filters[1].contrast = parseFloat(panel.querySelector('#contrastRange').value);
            activeImg.applyFilters();
            canvas.renderAll();
            if (state.isPreviewMode) renderPreviewMode();
            pushHistory();
        }

        panel.querySelector('#brightnessRange').addEventListener('input', updateFilters);
        panel.querySelector('#contrastRange').addEventListener('input', updateFilters);

        panel.querySelector('.reset-btn').addEventListener('click', () => {
            panel.querySelector('#brightnessRange').value = 0;
            panel.querySelector('#contrastRange').value = 0;
            updateFilters();
        });

        panel.querySelector('.close-btn').addEventListener('click', closeActiveControls);
    }

    // Fungsi untuk mengatur ukuran desain secara manual
    function applyManualSize() {
        const widthCm = parseFloat(sizeBox.widthInput.value);
        const heightCm = parseFloat(sizeBox.heightInput.value);
        if (isNaN(widthCm) || isNaN(heightCm) || widthCm <= 0 || heightCm <= 0) {
            showAlert('Invalid size input');
            return;
        }
        const activeImg = canvas.getActiveObject();
        if (!activeImg || !(activeImg instanceof fabric.Image)) {
            showAlert('Please select an image to resize');
            return;
        }
        // Hitung skala baru dalam px
        const pxWidth = widthCm * CM_TO_PX;
        const pxHeight = heightCm * CM_TO_PX;
        // Atur skala gambar agar sesuai ukuran px yang diinginkan
        // Gunakan scaleX dan scaleY agar proporsi sesuai input
        activeImg.set({
            scaleX: pxWidth / activeImg.width,
            scaleY: pxHeight / activeImg.height
        });
        canvas.renderAll();
        if (state.isPreviewMode) renderPreviewMode();
        pushHistory();
    }

    // Sinkronisasi sizebox dengan gambar aktif
    function updateSizeBoxFromActive() {
        const activeImg = canvas.getActiveObject();
        if (!activeImg || !(activeImg instanceof fabric.Image)) {
            clearSizeBox();
            return;
        }
        const widthCm = Math.round((activeImg.width * activeImg.scaleX) / CM_TO_PX * 100) / 100;
        const heightCm = Math.round((activeImg.height * activeImg.scaleY) / CM_TO_PX * 100) / 100;
        sizeBox.widthInput.value = widthCm > 0 ? widthCm : '';
        sizeBox.heightInput.value = heightCm > 0 ? heightCm : '';
    }
    function clearSizeBox() {
        sizeBox.widthInput.value = '';
        sizeBox.heightInput.value = '';
    }

    // Utility functions
    function closeActiveControls() {
        if (state.activeControlsPanel) {
            state.activeControlsPanel.classList.remove('show');
            setTimeout(() => {
                if (state.activeControlsPanel) {
                    state.activeControlsPanel.remove();
                    state.activeControlsPanel = null;
                }
            }, 180);
        }
    }

    function showAlert(message) {
        const alert = document.createElement('div');
        alert.className = 'alert';
        alert.innerHTML = message; // allow HTML for line breaks
        alert.style.opacity = '0';
        alert.style.transform = 'translateY(20px)';
        document.body.appendChild(alert);

        setTimeout(() => {
            alert.style.opacity = '1';
            alert.style.transform = 'translateY(0)';
        }, 60);

        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(20px)';
            setTimeout(() => alert.remove(), 350);
        }, 3500);
    }

    function handleDragOver(e) {
        e.preventDefault();
        dom.dropZone.classList.add('dragover');
    }

    function handleDragLeave() {
        dom.dropZone.classList.remove('dragover');
    }

    function handleDrop(e) {
        e.preventDefault();
        dom.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleImage(e.dataTransfer.files[0]);
    }

    function handleFileSelect(e) {
        if (e.target.files[0]) handleImage(e.target.files[0]);
    }

    // Close controls when clicking outside
    document.addEventListener('mousedown', (e) => {
        if (state.activeControlsPanel && !state.activeControlsPanel.contains(e.target)) {
            if (![dom.blendBtn, dom.adjustBtn].includes(e.target)) {
                closeActiveControls();
            }
        }
    });

    // Responsive: reposition panel if too close to edge
    window.addEventListener('resize', () => {
        if (state.activeControlsPanel) {
            let panel = state.activeControlsPanel;
            let rect = panel.getBoundingClientRect();
            if (rect.right > window.innerWidth) panel.style.left = (window.innerWidth - rect.width - 8) + 'px';
            if (rect.bottom > window.innerHeight) panel.style.top = (window.innerHeight - rect.height - 8) + 'px';
        }
        // Responsive canvas container
        canvasContainer.style.width = Math.min(canvas.width, window.innerWidth - 40) + 'px';
        canvasContainer.style.height = Math.min(canvas.height, window.innerHeight - 120) + 'px';
    });

    // Focus canvas after important actions
    function focusCanvas() {
        document.getElementById('designCanvas').focus();
    }

    // Add crop modal styles
    const style = document.createElement('style');
    style.innerHTML = `
    /* ...existing code... */
    .controls-panel.show {
        animation: floatPanelIn 0.35s cubic-bezier(.23,1.07,.32,1);
    }
    .alert {
        transition: opacity 0.3s, transform 0.3s;
    }
    .context-menu {
        transition: opacity 0.18s, transform 0.18s;
    }
    `;
    document.head.appendChild(style);

    // Panggil setup history
    setupHistoryListeners();
    initHistory();

    // --- Preview Mode Improvements ---
    function togglePreview() {
        state.isPreviewMode = !state.isPreviewMode;
        const container = document.querySelector('.canvas-container');
        if (state.isPreviewMode) {
            container.classList.add('preview-mode');
            // Hide all controls and overlays
            canvas.discardActiveObject();
            canvas.selection = false;
            canvas.forEachObject(obj => obj.selectable = false);
            renderPreviewMode();
        } else {
            container.classList.remove('preview-mode');
            canvas.selection = true;
            canvas.forEachObject(obj => obj.selectable = true);
            // Remove preview overlays if any
            const previewImg = container.querySelector('.canvas-preview-img');
            if (previewImg) previewImg.remove();
            canvas.renderAll();
        }
    }

    function renderPreviewMode() {
        // Remove previous preview image if exists
        const container = document.querySelector('.canvas-container');
        const oldPreview = container.querySelector('.canvas-preview-img');
        if (oldPreview) oldPreview.remove();

        // Buat overlay img dengan ukuran persis 1:1 sesuai canvas (800x800)
        const img = document.createElement('img');
        img.src = canvas.toDataURL({
            format: 'png',
            multiplier: 1,
            enableRetinaScaling: false
        });
        img.className = 'canvas-preview-img';
        img.style.position = 'absolute';
        img.style.left = '0';
        img.style.top = '0';
        img.style.width = canvas.width + 'px';
        img.style.height = canvas.height + 'px';
        img.style.zIndex = '9999';
        img.style.pointerEvents = 'none';
        img.style.background = 'transparent';

        // Pastikan container relatif dan cukup besar
        container.style.position = 'relative';
        container.style.width = canvas.width + 'px';
        container.style.height = canvas.height + 'px';

        container.appendChild(img);
    }
});
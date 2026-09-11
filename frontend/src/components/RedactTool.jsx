import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Renders an uploaded PDF or image onto a canvas (one page at a time for PDFs),
// lets the user draw black boxes over anything sensitive, and produces a
// redacted image file to use instead of the original.
export default function RedactTool({ file, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [boxes, setBoxes] = useState({}); // { pageNum: [{x,y,w,h}, ...] }
  const [drawing, setDrawing] = useState(null);
  const [baseImage, setBaseImage] = useState(null);
  const [loading, setLoading] = useState(true);

  const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

  // Load the file (PDF or image) once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (isPdf) {
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } else {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { if (!cancelled) { setBaseImage(img); setLoading(false); } };
        img.src = url;
        return;
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [file]);

  // Render current page/image + boxes onto the canvas
  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (isPdf && pdfDoc) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } else if (baseImage) {
      canvas.width = baseImage.width;
      canvas.height = baseImage.height;
      ctx.drawImage(baseImage, 0, 0);
    } else {
      return;
    }

    ctx.fillStyle = 'black';
    (boxes[pageNum] || []).forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
  }, [isPdf, pdfDoc, baseImage, pageNum, boxes]);

  useEffect(() => { render(); }, [render]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleMouseDown = (e) => setDrawing({ start: getPos(e), end: getPos(e) });
  const handleMouseMove = (e) => { if (drawing) setDrawing(d => ({ ...d, end: getPos(e) })); };
  const handleMouseUp = () => {
    if (!drawing) return;
    const x = Math.min(drawing.start.x, drawing.end.x);
    const y = Math.min(drawing.start.y, drawing.end.y);
    const w = Math.abs(drawing.end.x - drawing.start.x);
    const h = Math.abs(drawing.end.y - drawing.start.y);
    if (w > 4 && h > 4) {
      setBoxes(prev => ({ ...prev, [pageNum]: [...(prev[pageNum] || []), { x, y, w, h }] }));
    }
    setDrawing(null);
  };

  const undoLast = () => {
    setBoxes(prev => ({ ...prev, [pageNum]: (prev[pageNum] || []).slice(0, -1) }));
  };

  // Draw the in-progress box as a live preview
  useEffect(() => {
    if (!drawing) return;
    render().then(() => {
      const ctx = canvasRef.current.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const x = Math.min(drawing.start.x, drawing.end.x);
      const y = Math.min(drawing.start.y, drawing.end.y);
      const w = Math.abs(drawing.end.x - drawing.start.x);
      const h = Math.abs(drawing.end.y - drawing.start.y);
      ctx.fillRect(x, y, w, h);
    });
  }, [drawing]);

  const finish = async () => {
    // Re-render every page with its boxes baked in, export each as an image,
    // then hand back a list of redacted image files (one per page).
    const outputFiles = [];
    const pages = isPdf ? numPages : 1;
    for (let p = 1; p <= pages; p++) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (isPdf) {
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } else {
        canvas.width = baseImage.width;
        canvas.height = baseImage.height;
        ctx.drawImage(baseImage, 0, 0);
      }
      ctx.fillStyle = 'black';
      (boxes[p] || []).forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      outputFiles.push(new File([blob], `redacted-page-${p}.png`, { type: 'image/png' }));
    }
    onDone(outputFiles);
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl">
        <div className="modal-header">
          <div className="modal-title">Black Out Sensitive Info</div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info mb-16">
            Click and drag over anything you want hidden (account numbers, routing numbers, etc.) before this document is sent for extraction.
          </div>

          {isPdf && numPages > 1 && (
            <div className="flex gap-8 items-center mb-16">
              <button className="btn btn-secondary btn-sm" disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)}>← Prev</button>
              <span className="text-sm">Page {pageNum} of {numPages}</span>
              <button className="btn btn-secondary btn-sm" disabled={pageNum >= numPages} onClick={() => setPageNum(p => p + 1)}>Next →</button>
            </div>
          )}

          {loading ? (
            <div className="spinner-wrapper"><div className="spinner" /></div>
          ) : (
            <div ref={containerRef} style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', cursor: 'crosshair', display: 'block' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              />
            </div>
          )}

          <div className="flex gap-8 mt-16">
            <button className="btn btn-secondary btn-sm" onClick={undoLast} disabled={!(boxes[pageNum]?.length)}>
              Undo Last Box (this page)
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={finish}>Use Redacted Version</button>
        </div>
      </div>
    </div>
  );
}

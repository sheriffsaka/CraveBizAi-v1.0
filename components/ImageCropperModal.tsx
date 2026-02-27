

import React, { useState, useRef, useEffect } from 'react';
import Modal from './Modal';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string; // Base64 or URL of the image to crop
  onCrop: (croppedImageBase64: string) => void;
}

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ isOpen, onClose, imageSrc, onCrop }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const drawImageOnCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasSize = 250; // Fixed size for the square preview/crop area
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    // Calculate aspect ratios
    const imgAspectRatio = img.naturalWidth / img.naturalHeight;
    const canvasAspectRatio = canvasSize / canvasSize; // Always 1 for square

    let sx, sy, sWidth, sHeight; // Source image coordinates and dimensions
    let dx, dy, dWidth, dHeight; // Destination canvas coordinates and dimensions

    if (imgAspectRatio > canvasAspectRatio) {
      // Image is wider than canvas (relatively), fit height to canvas, crop width
      sHeight = img.naturalHeight;
      sWidth = sHeight * canvasAspectRatio;
      sx = (img.naturalWidth - sWidth) / 2;
      sy = 0;
    } else {
      // Image is taller than or same aspect ratio as canvas, fit width to canvas, crop height
      sWidth = img.naturalWidth;
      sHeight = sWidth / canvasAspectRatio;
      sx = 0;
      sy = (img.naturalHeight - sHeight) / 2;
    }

    // Draw the image cropped to the square aspect ratio, covering the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    if (isOpen && imageSrc && imageLoaded) {
      drawImageOnCanvas();
    }
  }, [isOpen, imageSrc, imageLoaded]);

  const handleApplyCrop = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const croppedImage = canvas.toDataURL('image/png'); // Output as PNG
      onCrop(croppedImage);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crop Company Logo">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative w-64 h-64 border-2 border-primary-300 rounded-lg overflow-hidden flex items-center justify-center bg-gray-100">
            {!imageLoaded && <span className="text-gray-500">Loading image...</span>}
            <img 
                ref={imageRef} 
                src={imageSrc} 
                alt="Image to crop" 
                className={`max-w-full max-h-full object-contain ${imageLoaded ? '' : 'hidden'}`} 
                onLoad={() => setImageLoaded(true)}
                style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden' }} // Keep hidden for actual rendering
            />
            {/* Canvas for rendering the cropped preview */}
            <canvas ref={canvasRef} className="block border border-gray-300 rounded-lg"></canvas>
        </div>
        <p className="text-sm text-gray-600 text-center">Your logo will be cropped to a square. Adjust source image for best fit.</p>
        <div className="flex justify-end pt-4 space-x-2 w-full">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
          <button type="button" onClick={handleApplyCrop} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Apply Crop</button>
        </div>
      </div>
    </Modal>
  );
};

export default ImageCropperModal;
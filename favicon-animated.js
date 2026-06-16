(function() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const points = [
    { x: 5, y: 22 },
    { x: 11, y: 14 },
    { x: 17, y: 18 },
    { x: 22, y: 11 },
    { x: 27, y: 8 }
  ];

  let progress = 0;
  const speed = 0.02;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  function drawFrame() {
    ctx.clearRect(0, 0, size, size);

    // Background rounded rect
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 6);
    ctx.fillStyle = '#020202';
    ctx.fill();

    // Draw chart line up to current progress
    const totalSegments = points.length - 1;
    const currentLength = progress * totalSegments;

    ctx.beginPath();
    ctx.strokeStyle = '#fafafa';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < totalSegments; i++) {
      if (currentLength <= i) break;

      const segProgress = Math.min(currentLength - i, 1);
      const x = points[i].x + (points[i + 1].x - points[i].x) * segProgress;
      const y = points[i].y + (points[i + 1].y - points[i].y) * segProgress;
      ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Draw dot at the end of line
    if (progress > 0) {
      const segIdx = Math.min(Math.floor(currentLength), totalSegments - 1);
      const segProgress = Math.min(currentLength - segIdx, 1);
      const dotX = points[segIdx].x + (points[segIdx + 1].x - points[segIdx].x) * segProgress;
      const dotY = points[segIdx].y + (points[segIdx + 1].y - points[segIdx].y) * segProgress;

      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    }

    link.href = canvas.toDataURL('image/png');

    progress += speed;
    if (progress > 1.3) progress = 0;

    requestAnimationFrame(drawFrame);
  }

  drawFrame();
})();

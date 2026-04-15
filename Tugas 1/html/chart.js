// Chart configuration
const MAX_DATA_POINTS = 100; // Jumlah data point yang ditampilkan
const chartData = {
    brakeSensor: [],
    throttleFinal: [],
    throttle1: [],
    throttle2: [],
    timestamps: []
};
let lastValues = {
    brakeSensor: 0,
    throttleFinal: 0,
    throttle1: 0,
    throttle2: 0
};

let smoothingWindow = 3; // Ambil rata-rata 3 data terakhir

let canvas, ctx;
let animationId;

// Fixed scale 0-100
const CHART_MIN = 0;
const CHART_MAX = 100;

// Colors for each line
const colors = {
    brakeSensor: '#f44336',    // Red
    throttleFinal: '#4caf50',  // Green
    throttle1: '#2196f3',      // Blue
    throttle2: '#ff9800'       // Orange
};

function initChart() {
    canvas = document.getElementById('sensorChart');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Start animation loop
    drawChart();
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth - 40;
    canvas.height = container.clientHeight - 40;
}

function addDataPoint(data) {
    const parseAndClamp = (val) => {
        let num = parseFloat(val);
        if (isNaN(num)) return 0;
        
        num = Math.round(num * 100) / 100;
        num = Math.max(0, Math.min(99, num)); // Cap di 99
        
        return num;
    };
    
    const bs = parseAndClamp(data.brakeSensor);
    const tf = parseAndClamp(data.throttleFinal);
    const t1 = parseAndClamp(data.throttle1);
    const t2 = parseAndClamp(data.throttle2);
    
    // Spike detection: jika perubahan > 30% dari rata-rata, reject
    const detectSpike = (newVal, dataArray) => {
        if (dataArray.length < 3) return newVal;
        
        const recent = dataArray.slice(-3);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        
        // Jika perubahan terlalu besar (>30%), gunakan rata-rata
        if (Math.abs(newVal - avg) > 30) {
            console.warn('Spike detected, using average instead');
            return avg;
        }
        
        return newVal;
    };
    
    chartData.brakeSensor.push(detectSpike(bs, chartData.brakeSensor));
    chartData.throttleFinal.push(detectSpike(tf, chartData.throttleFinal));
    chartData.throttle1.push(detectSpike(t1, chartData.throttle1));
    chartData.throttle2.push(detectSpike(t2, chartData.throttle2));
    chartData.timestamps.push(new Date().toLocaleTimeString('id-ID'));
    
    // Keep only last MAX_DATA_POINTS
    if (chartData.brakeSensor.length > MAX_DATA_POINTS) {
        chartData.brakeSensor.shift();
        chartData.throttleFinal.shift();
        chartData.throttle1.shift();
        chartData.throttle2.shift();
        chartData.timestamps.shift();
    }
}

function drawChart() {
    if (!ctx || !canvas) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 50;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    drawGrid(width, height, padding);
    
    // Draw axes
    drawAxes(width, height, padding);
    
    // Draw lines
    if (chartData.brakeSensor.length > 0) {
        drawLine(chartData.brakeSensor, colors.brakeSensor, width, height, padding);
        drawLine(chartData.throttleFinal, colors.throttleFinal, width, height, padding);
        drawLine(chartData.throttle1, colors.throttle1, width, height, padding);
        drawLine(chartData.throttle2, colors.throttle2, width, height, padding);
    }
    
    // Draw labels
    drawLabels(width, height, padding);
    
    // Continue animation
    animationId = requestAnimationFrame(drawChart);
}

function drawGrid(width, height, padding) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    // Horizontal lines (10 lines for 0-100 scale, every 10%)
    for (let i = 0; i <= 10; i++) {
        const y = padding + (height - 2 * padding) * i / 10;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Vertical lines
    for (let i = 0; i <= 10; i++) {
        const x = padding + (width - 2 * padding) * i / 10;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
    }
}

function drawAxes(width, height, padding) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
}

function drawLine(data, color, width, height, padding) {
    if (data.length < 2) return;
    
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
        // X position based on data index
        const x = padding + (chartWidth * i) / (MAX_DATA_POINTS - 1);
        
        // Y position - data already clamped in addDataPoint
        // No need to clamp again, just normalize
        const normalizedValue = data[i] / 100; // Since data is already 0-100
        const y = height - padding - (chartHeight * normalizedValue);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
}

function drawLabels(width, height, padding) {
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    
    // Y-axis labels (0-100 scale, every 10%)
    for (let i = 0; i <= 10; i++) {
        const value = CHART_MAX - (i * 10); // 100, 90, 80, ..., 0
        const y = padding + (height - 2 * padding) * i / 10;
        ctx.fillText(value + '%', padding - 10, y + 5);
    }
    
    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Time', width / 2, height - 10);
    
    // Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Percentage (%)', 0, 0);
    ctx.restore();
}

function clearChart() {
    chartData.brakeSensor = [];
    chartData.throttleFinal = [];
    chartData.throttle1 = [];
    chartData.throttle2 = [];
    chartData.timestamps = [];
    
    // Reset last values
    lastValues = {
        brakeSensor: 0,
        throttleFinal: 0,
        throttle1: 0,
        throttle2: 0
    };
}

function stopChart() {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

// Initialize chart when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChart);
} else {
    initChart();
}
let port;
let reader;
let isReading = false;
let isLogging = false;
let fileHandle = null;
let writable = null;
let buffer = '';

// Statistics
let packetCount = 0;
let fileSize = 0;
let lastPacketTime = Date.now();
let packetsPerSecond = 0;

let lastLogTime = 0;
let activeLoggingDelay = 1000; // Delay yang sedang digunakan untuk logging
let loggingDelay = 1000; // placeholder untuk input delay pada HTML


// Check browser support
if (!('serial' in navigator)) {
    document.getElementById('warningBox').style.display = 'block';
    document.getElementById('connectBtn').disabled = true;
}

const loggingSpeedInput = document.getElementById('loggingSpeed');
loggingSpeedInput.addEventListener('input', function () {
    loggingDelay = parseInt(this.value);
});

function addToConsole(message, type = 'info') {
    const consoleEl = document.getElementById('console');
    const timestamp = new Date().toLocaleTimeString('id-ID');
    const line = document.createElement('div');
    line.className = 'console-line';

    let className = '';
    if (type === 'data') className = 'console-data';
    else if (type === 'error') className = 'console-error';
    else if (type === 'success') className = 'console-success';

    line.innerHTML = `<span class="console-timestamp">[${timestamp}]</span><span class="${className}">${message}</span>`;

    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;

    // Keep only last 100 lines
    if (consoleEl.children.length > 100) {
        consoleEl.removeChild(consoleEl.firstChild);
    }
}

async function connectSerial() {
    try {
        addToConsole('Opening serial port selection dialog...');
        port = await navigator.serial.requestPort();

        const baudRate = parseInt(document.getElementById('baudRate').value);

        addToConsole(`Opening port with baud rate: ${baudRate}`);
        await port.open({ baudRate: baudRate });

        addToConsole('✅ Serial port connected successfully!', 'success');
        updateStatus('connected');

        readSerialData();

    } catch (error) {
        addToConsole(`❌ Error: ${error.message}`, 'error');
        console.error('Error:', error);
    }
}

async function startLogging() {
    if (isNaN(loggingDelay)) {
        alert('Value Delay Invalid!');
        return
    }
    try {
        activeLoggingDelay = loggingDelay;

        // Prompt user to select file location
        addToConsole('Opening file save dialog...');

        fileHandle = await window.showSaveFilePicker({
            suggestedName: `uart-log-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
            types: [{
                description: 'CSV Files',
                accept: { 'text/csv': ['.csv'] },
            }],
        });

        writable = await fileHandle.createWritable();
        isLogging = true;

        // Write header V2
        let header = `timestamp,Brake Sensor,Throttle Final,Throttle 1,Throttle 2,Raw Brake Sensor,Raw Throttle Final,Raw Throttle 1,Raw Throttle 2,Brake Fault,Throttle Fault,BPPC Fault,Motor Status\n`;
        await writable.write(header);
        fileSize += header.length;

        addToConsole('✅ Logging started! Writing to file...', 'success');
        updateStatus('logging');

        document.getElementById('startLogBtn').disabled = true;
        document.getElementById('stopLogBtn').disabled = false;

    } catch (error) {
        addToConsole(`❌ Error starting log: ${error.message}`, 'error');
        console.error('Error:', error);
    }
}

async function stopLogging() {
    if (writable) {
        try {
            isLogging = false;
            await writable.close();

            addToConsole('✅ Logging stopped. File saved successfully!', 'success');
            updateStatus('connected');

        } catch (error) {
            addToConsole(`❌ Error closing file: ${error.message}`, 'error');
        }
    }

    writable = null;
    fileHandle = null;

    document.getElementById('startLogBtn').disabled = false;
    document.getElementById('stopLogBtn').disabled = true;
}

function parseUARTData(line) {
    // Remove newline and trim
    line = line.trim();

    if (line.length !== 19) {
        addToConsole(`⚠️ Invalid data length: ${line.length} (expected 14+)`, 'error');
        return null;
    }

    try {

        // Parse fixed-width format: "%-5u%-5u%-5u%c%c%c%c
        let rawBrakeSensor = line.substring(0, 5).trim();
        let rawThrottle1 = line.substring(5, 10).trim();
        let rawThrottle2 = line.substring(10, 15).trim();
        
        // CAP raw values at 10000 (100*100)
        const capRawValue = (raw) => {
            const val = parseInt(raw);
            return isNaN(val) ? 0 : Math.min(10000, val);
        };
        
        rawBrakeSensor = capRawValue(rawBrakeSensor);
        rawThrottle1 = capRawValue(rawThrottle1);
        rawThrottle2 = capRawValue(rawThrottle2);
        
        // Convert to percentage (divide by 100)
        let brakeSensor = (rawBrakeSensor / 100).toFixed(0);
        let throttle1 = (rawThrottle1 / 100);
        let throttle2 = (rawThrottle2 / 100);

        const brakeFault = line.charAt(15);
        const throttleFault = line.charAt(16);
        const BPPCFault = line.charAt(17);
        const motorStatus = line.charAt(18);

        // Validation
        if (isNaN(brakeSensor) || isNaN(throttle1) || isNaN(throttle2)) {
            addToConsole(`⚠️ Invalid numeric values in: "${line}"`, 'error');
            return null;
        }

        if (brakeFault !== 't' && brakeFault !== 'f') {
            addToConsole(`⚠️ Invalid brakeFault value: '${brakeFault}'`, 'error');
            return null;
        }

        if (throttleFault !== 't' && throttleFault !== 'f') {
            addToConsole(`⚠️ Invalid throttleFault value: '${throttleFault}'`, 'error');
            return null;
        }

        let rawThrottleFinal = (rawThrottle1 + rawThrottle2) / 2;
        let throttleFinal = ((throttle1+throttle2)/2).toFixed(2);
        throttle1 = throttle1.toFixed(0);
        throttle2 = throttle2.toFixed(0);

        return {
            brakeSensor,
            throttleFinal,
            throttle1,
            throttle2,
            brakeFault: brakeFault === 't',
            throttleFault: throttleFault === 't',
            BPPCFault: BPPCFault === 't',
            motorStatus: motorStatus === 't',
            rawBrakeSensor,
            rawThrottle1,
            rawThrottle2,
            rawThrottleFinal
        };

    } catch (error) {
        addToConsole(`❌ Parse error: ${error.message}`, 'error');
        return null;
    }
}

function updateDisplay(data) {
    // Update values
    document.getElementById('brakeSensor').textContent = data.brakeSensor;
    document.getElementById('throttleFinal').textContent = data.throttleFinal;
    document.getElementById('throttle1').textContent = data.throttle1;
    document.getElementById('throttle2').textContent = data.throttle2;

    // Update fault lights
    const brakeFaultLight = document.getElementById('brakeFaultLight');
    const throttleFaultLight = document.getElementById('throttleFaultLight');
    const BPPCFaultLight = document.getElementById('BPPCFaultLight');
    const motorStatusLight = document.getElementById('motorStatusLight');

    if (data.brakeFault) {
        brakeFaultLight.className = 'fault-light red';
    } else {
        brakeFaultLight.className = 'fault-light green';
    }

    if (data.throttleFault) {
        throttleFaultLight.className = 'fault-light red';
    } else {
        throttleFaultLight.className = 'fault-light green';
    }

    if (data.BPPCFault) {
        BPPCFaultLight.className = 'fault-light red';
    } else {
        BPPCFaultLight.className = 'fault-light green';
    }

    if (data.motorStatus) {
        motorStatusLight.className = 'fault-light green';
    } else {
        motorStatusLight.className = 'fault-light red';
    }

    // Update statistics
    packetCount++;
    document.getElementById('packetCount').textContent = packetCount;

    // Calculate data rate
    const now = Date.now();
    const elapsed = (now - lastPacketTime) / 1000;
    if (elapsed > 0) {
        packetsPerSecond = Math.round(1 / elapsed);
        document.getElementById('dataRate').textContent = packetsPerSecond + '/s';
    }
    lastPacketTime = now;

    const displayDelay = isLogging ? activeLoggingDelay : loggingDelay;
    if (displayDelay <= 0) {
        document.getElementById('delayLabel').textContent = `Realtime`;
    } else if (isNaN(displayDelay)) {
        document.getElementById('delayLabel').textContent = `Invalid!`;
    } else {
        document.getElementById('delayLabel').textContent = displayDelay;
    }

    // Update file size
    document.getElementById('fileSize').textContent = (fileSize / 1024).toFixed(2) + ' KB';

    if (typeof addDataPoint === 'function') {
        addDataPoint(data);
    }
}

async function readSerialData() {
    isReading = true;

    try {
        reader = port.readable.getReader();
        const textDecoder = new TextDecoder();

        while (isReading) {
            const { value, done } = await reader.read();

            if (done) {
                addToConsole('Stream ended or port closed');
                break;
            }

            if (value) {
                const text = textDecoder.decode(value);
                buffer += text;

                // Process complete lines
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.trim().length > 0) {
                        addToConsole(`Raw: "${line}"`, 'data');

                        // Parse data
                        const parsedData = parseUARTData(line);
                        if (parsedData) {
                            updateDisplay(parsedData);

                            // Write to file if logging
                            if (isLogging && writable) {
                                const now = Date.now();

                                if ((now - lastLogTime >= activeLoggingDelay) && !(isNaN(activeLoggingDelay))) {
                                    try {
                                        const timestamp = new Date().toISOString();
                                        const logLine = `${timestamp},${parsedData.brakeSensor},${parsedData.throttleFinal},${parsedData.throttle1},${parsedData.throttle2},${parsedData.rawBrakeSensor},${parsedData.rawThrottleFinal},${parsedData.rawThrottle1},${parsedData.rawThrottle2},${parsedData.brakeFault},${parsedData.throttleFault},${parsedData.BPPCFault},${parsedData.motorStatus}\n`;
                                        await writable.write(logLine);
                                        fileSize += logLine.length;
                                        lastLogTime = now;
                                    } catch (error) {
                                        console.log('Write skipped (file closing)');
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

    } catch (error) {
        addToConsole(`❌ Read error: ${error.message}`, 'error');
        console.error('Read error:', error);
    } finally {
        if (reader) {
            reader.releaseLock();
        }
    }
}

async function disconnectSerial() {
    isReading = false;

    // Stop logging if active
    if (isLogging) {
        await stopLogging();
    }

    try {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
        }

        if (port) {
            await port.close();
            addToConsole('Serial port disconnected', 'success');
        }

        updateStatus('disconnected');

        // Reset display
        document.getElementById('brakeSensor').textContent = '--';
        document.getElementById('throttleFinal').textContent = '--.--';
        document.getElementById('throttle1').textContent = '--';
        document.getElementById('throttle2').textContent = '--';
        document.getElementById('brakeFaultLight').className = 'fault-light';
        document.getElementById('throttleFaultLight').className = 'fault-light';
        document.getElementById('BPPCFaultLight').className = 'fault-light';
        document.getElementById('motorStatusLight').className = 'fault-light';
        document.getElementById('delayLabel').textContent = `0 ms`;

        if (typeof clearChart === 'function') {
            clearChart();
        }

    } catch (error) {
        addToConsole(`❌ Disconnect error: ${error.message}`, 'error');
        console.error('Disconnect error:', error);
    }
}

function updateStatus(state) {
    const statusEl = document.getElementById('status');
    const connectBtn = document.getElementById('connectBtn');
    const startLogBtn = document.getElementById('startLogBtn');
    const stopLogBtn = document.getElementById('stopLogBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');

    if (state === 'connected') {
        statusEl.className = 'status status-connected';
        statusEl.innerHTML = '✅ Connected';
        connectBtn.disabled = true;
        startLogBtn.disabled = false;
        stopLogBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else if (state === 'logging') {
        statusEl.className = 'status status-logging';
        statusEl.innerHTML = '📝 Connected & Logging';
        connectBtn.disabled = true;
        startLogBtn.disabled = true;
        stopLogBtn.disabled = false;
        disconnectBtn.disabled = false;
    } else {
        statusEl.className = 'status status-disconnected';
        statusEl.innerHTML = '⚠️ Disconnected';
        connectBtn.disabled = false;
        startLogBtn.disabled = true;
        stopLogBtn.disabled = true;
        disconnectBtn.disabled = false;
    }
}

window.addEventListener('beforeunload', async (e) => {
    if (isLogging) {
        e.preventDefault();
        e.returnValue = '';
        await stopLogging();
    }
    if (port) {
        await disconnectSerial();
    }
});
const roadCanvas = document.getElementById("roadCanvas");
const roadCtx = roadCanvas.getContext("2d");
const netCanvas = document.getElementById("networkCanvas");
const netCtx = netCanvas.getContext("2d");

roadCanvas.width = 300;
roadCanvas.height = window.innerHeight * 0.9;
netCanvas.width = 500;
netCanvas.height = window.innerHeight * 0.9;

const laneCenters = [70, 150, 230];

// --- Brain Visualizer ---
class Visualizer {
    static drawNetwork(ctx, network) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (!network) return;
        const margin = 50, width = ctx.canvas.width - margin * 2, height = ctx.canvas.height - margin * 2;
        const inputY = margin + height, hiddenY = margin + height / 2, outputY = margin;
        const getNodeX = (i, total) => margin + (total === 1 ? width / 2 : (width / (total - 1)) * i);

        network.weights_ih.forEach((weights, h) => weights.forEach((w, i) => this.drawConnection(ctx, getNodeX(i, network.inputs.length), inputY, getNodeX(h, network.hidden.length), hiddenY, w)));
        network.weights_ho.forEach((weights, o) => weights.forEach((w, h) => this.drawConnection(ctx, getNodeX(h, network.hidden.length), hiddenY, getNodeX(o, network.outputs.length), outputY, w)));

        network.inputs.forEach((val, i) => this.drawNode(ctx, getNodeX(i, network.inputs.length), inputY, val));
        network.hidden.forEach((val, i) => this.drawNode(ctx, getNodeX(i, network.hidden.length), hiddenY, val));
        network.outputs.forEach((val, i) => this.drawNode(ctx, getNodeX(i, network.outputs.length), outputY, val));
    }
    static drawConnection(ctx, x1, y1, x2, y2, weight) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255, 235, 59, 0.4)";
        ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    }
    static drawNode(ctx, x, y, act) {
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#444"; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 16 * Math.min(Math.abs(act), 1), 0, Math.PI * 2);
        ctx.fillStyle = act > 0 ? "rgba(255, 235, 59, 0.9)" : "rgba(33, 150, 243, 0.9)"; ctx.fill();
    }
}

// --- Math Helpers ---
function getIntersection(A, B, C, D) {
    const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x), uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y), bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);
    if (bottom !== 0) {
        const t = tTop / bottom, u = uTop / bottom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), offset: t };
    }
    return null;
}
function polysIntersect(poly1, poly2) {
    for (let i = 0; i < poly1.length; i++) for (let j = 0; j < poly2.length; j++) if (getIntersection(poly1[i], poly1[(i + 1) % poly1.length], poly2[j], poly2[(j + 1) % poly2.length])) return true;
    return false;
}

// --- Car Object ---
class Car {
    constructor(x, y, width, height, color, isTraffic = false, speed = 2) {
        this.x = x; this.y = y; this.width = width; this.height = height;
        this.color = color; this.isTraffic = isTraffic; this.speed = speed;
        this.angle = 0; this.damaged = false; this.sensors = [1, 1, 1, 1, 1];
        this.sensorRays = []; this.sensorTouches = [];
    }
    getPolygon() {
        const pts = [], rad = Math.hypot(this.width, this.height) / 2, alpha = Math.atan2(this.width, this.height);
        pts.push({ x: this.x - Math.sin(this.angle - alpha) * rad, y: this.y - Math.cos(this.angle - alpha) * rad });
        pts.push({ x: this.x - Math.sin(this.angle + alpha) * rad, y: this.y - Math.cos(this.angle + alpha) * rad });
        pts.push({ x: this.x - Math.sin(this.angle + Math.PI - alpha) * rad, y: this.y - Math.cos(this.angle + Math.PI - alpha) * rad });
        pts.push({ x: this.x - Math.sin(this.angle + Math.PI + alpha) * rad, y: this.y - Math.cos(this.angle + Math.PI + alpha) * rad });
        return pts;
    }
    update(throttle = 0, turn = 0, roadBorders = [], traffic = []) {
        if (this.damaged) return;
        if (this.isTraffic) { this.y -= this.speed; } 
        else {
            this.speed += throttle * 0.15; this.speed *= 0.95; this.angle += turn * 0.05;
            this.x -= Math.sin(this.angle) * this.speed; this.y -= Math.cos(this.angle) * this.speed;
            this.updateSensors(roadBorders, traffic);
            this.checkCollision(roadBorders, traffic);
        }
    }
    updateSensors(roadBorders, traffic) {
        this.sensorRays = []; this.sensorTouches = [];
        const rayAngles = [0.6, 0.3, 0, -0.3, -0.6];
        rayAngles.forEach((ray, i) => {
            const start = { x: this.x, y: this.y }, end = { x: this.x - Math.sin(this.angle + ray) * 160, y: this.y - Math.cos(this.angle + ray) * 160 };
            this.sensorRays.push([start, end]);
            let touches = [];
            roadBorders.forEach(b => { const t = getIntersection(start, end, b[0], b[1]); if (t) touches.push(t); });
            traffic.forEach(c => { const poly = c.getPolygon(); for (let j = 0; j < poly.length; j++) { const t = getIntersection(start, end, poly[j], poly[(j + 1) % poly.length]); if (t) touches.push(t); }});
            if (touches.length === 0) { this.sensors[i] = 1.0; this.sensorTouches.push(end); } 
            else {
                const min = Math.min(...touches.map(t => t.offset));
                this.sensors[i] = min;
                this.sensorTouches.push(touches.find(t => t.offset === min));
            }
        });
    }
    checkCollision(roadBorders, traffic) {
        const poly = this.getPolygon();
        roadBorders.forEach(b => { if (getIntersection(poly[0], poly[1], b[0], b[1]) || getIntersection(poly[1], poly[2], b[0], b[1]) || getIntersection(poly[2], poly[3], b[0], b[1]) || getIntersection(poly[3], poly[0], b[0], b[1])) this.damaged = true; });
        traffic.forEach(t => { if (polysIntersect(poly, t.getPolygon())) this.damaged = true; });
    }
    draw(ctx) {
        if (!this.isTraffic && this.sensorRays.length > 0) {
            this.sensorRays.forEach((ray, i) => {
                ctx.beginPath(); ctx.moveTo(ray[0].x, ray[0].y); ctx.lineTo(this.sensorTouches[i].x, this.sensorTouches[i].y);
                ctx.strokeStyle = this.sensors[i] < 0.3 ? "#e74c3c" : "#f1c40f"; ctx.lineWidth = 2; ctx.stroke();
            });
        }
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(-this.angle);
        ctx.fillStyle = this.damaged ? "#555" : this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.fillStyle = "#111"; ctx.fillRect(-this.width / 3, -this.height / 2.5, this.width * 0.6, 10);
        ctx.restore();
    }
}

// --- Setup ---
const myCar = new Car(150, 300, 30, 50, "#8e44ad"); // One purple car

let traffic = [
    new Car(laneCenters[0], 100, 30, 50, "#2ecc71", true, 1.5),
    new Car(laneCenters[2], -100, 30, 50, "#e74c3c", true, 1.8),
    new Car(laneCenters[1], -300, 30, 50, "#2ecc71", true, 1.2),
    new Car(laneCenters[0], -500, 30, 50, "#e74c3c", true, 1.5)
];

let latestNetworkData = null;

async function animate() {
    // 1. Recycle Traffic (Infinite Highway)
    traffic.forEach(t => {
        if (t.y > myCar.y + 400) {
            t.y = myCar.y - 600 - Math.random() * 200;
            t.x = laneCenters[Math.floor(Math.random() * laneCenters.length)];
            t.speed = 1.2 + Math.random();
        }
    });

    // 2. Fetch AI Driving Commands
    let throttle = 0, turn = 0;
    if (!myCar.damaged) {
        try {
            const res = await fetch("http://127.0.0.1:5000/predict", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sensors: myCar.sensors })
            });
            if (res.ok) {
                const data = await res.json();
                throttle = data.throttle; turn = data.turn; latestNetworkData = data.network;
            }
        } catch(e) {}
    } else {
        // Respawn if it crashes
        setTimeout(() => { myCar.damaged = false; myCar.x = 150; myCar.y += 200; myCar.angle = 0; }, 1000);
    }

    // 3. Update Physics
    const roadBorders = [[{ x: 30, y: myCar.y - roadCanvas.height }, { x: 30, y: myCar.y + roadCanvas.height }], [{ x: 270, y: myCar.y - roadCanvas.height }, { x: 270, y: myCar.y + roadCanvas.height }]];
    myCar.update(throttle, turn, roadBorders, traffic);
    traffic.forEach(t => t.update(0, 0, roadBorders, []));

    // 4. Draw Road
    roadCanvas.height = window.innerHeight * 0.9; 
    roadCtx.save(); roadCtx.translate(0, -myCar.y + roadCanvas.height * 0.7);

    roadCtx.fillStyle = "#dcdde1"; roadCtx.fillRect(30, myCar.y - roadCanvas.height, 240, roadCanvas.height * 2);
    
    roadCtx.lineWidth = 5; roadCtx.strokeStyle = "#fff";
    roadCtx.beginPath(); roadCtx.moveTo(30, myCar.y - roadCanvas.height); roadCtx.lineTo(30, myCar.y + roadCanvas.height); roadCtx.stroke();
    roadCtx.beginPath(); roadCtx.moveTo(270, myCar.y - roadCanvas.height); roadCtx.lineTo(270, myCar.y + roadCanvas.height); roadCtx.stroke();
    roadCtx.lineWidth = 3; roadCtx.setLineDash([20, 20]);
    [110, 190].forEach(laneX => { roadCtx.beginPath(); roadCtx.moveTo(laneX, myCar.y - roadCanvas.height); roadCtx.lineTo(laneX, myCar.y + roadCanvas.height); roadCtx.stroke(); });

    traffic.forEach(t => t.draw(roadCtx));
    myCar.draw(roadCtx);
    roadCtx.restore();

    // 5. Draw Visualizer
    Visualizer.drawNetwork(netCtx, latestNetworkData);

    requestAnimationFrame(animate);
}

animate();
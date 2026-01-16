// --- Setup ---
const canvas = document.getElementById("pong");
const ctx = canvas.getContext("2d");
const uiLayer = document.getElementById("ui-layer");
const startBtn = document.getElementById("start-btn");

// Internal Resolution (Higher for crispier graphics)
const INTERNAL_WIDTH = 900;
const INTERNAL_HEIGHT = 600;

// Game Constants
const WIN_SCORE = 10;
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 15;
const BALL_RADIUS = 10;

// Colors
const COLOR_PLAYER = "blue"; 
const COLOR_COM = "red";    
const COLOR_BALL = "yellow";   
const COLOR_WON = "green";

// State
let gameRunning = false;
let animationId;
let shakeDuration = 0;

// --- Objects ---

const user = {
    x: 20,
    y: INTERNAL_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: COLOR_PLAYER,
    score: 0
};

const com = {
    x: INTERNAL_WIDTH - 20 - PADDLE_WIDTH,
    y: INTERNAL_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: COLOR_COM,
    score: 0
};

const ball = {
    x: INTERNAL_WIDTH / 2,
    y: INTERNAL_HEIGHT / 2,
    radius: BALL_RADIUS,
    speed: 9,
    velocityX: 6,
    velocityY: 6,
    color: COLOR_BALL,
    trail: [] // Store previous positions
};

const net = {
    x: INTERNAL_WIDTH / 2 - 1,
    y: 0,
    width: 2,
    height: 20,
    color: "#333"
};

// Particles Array
let particles = [];

// --- Audio (Synthesizer) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(freq, type, dur, vol = 0.1) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Frequency slide for retro effect
    if (type === 'sawtooth') {
        osc.frequency.exponentialRampToValueAtTime(freq / 2, audioCtx.currentTime + dur);
    }

    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

// --- VFX Systems ---

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.radius = Math.random() * 3 + 1;
        this.color = color;
        // Random explosion velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.friction = 0.95;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.alpha -= 0.03; // Fade out
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function spawnParticles(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function screenShake() {
    shakeDuration = 10; // Shake for 10 frames
}

// --- Logic ---

function resetBall() {
    ball.x = INTERNAL_WIDTH / 2;
    ball.y = INTERNAL_HEIGHT / 2;
    ball.speed = 9;
    ball.velocityX = -ball.velocityX; // Swap serve
    ball.velocityY = (Math.random() * 10) - 5;
    ball.trail = [];
}

function update() {
    // 1. Update Particles
    particles.forEach((p, index) => {
        p.update();
        if (p.alpha <= 0) particles.splice(index, 1);
    });

    // 2. Update Ball Trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 15) ball.trail.shift();

    // 3. Update Ball Position
    ball.x += ball.velocityX;
    ball.y += ball.velocityY;

    // 4. Wall Collision (Top/Bottom)
    if (ball.y - ball.radius < 0 || ball.y + ball.radius > INTERNAL_HEIGHT) {
        ball.velocityY = -ball.velocityY;
        playSound(200, 'square', 0.1);
        spawnParticles(ball.x, ball.y < INTERNAL_HEIGHT / 2 ? 0 : INTERNAL_HEIGHT, "#fff", 5);
    }

    // 5. Scoring
    if (ball.x - ball.radius < 0) {
        com.score++;
        playSound(100, 'sawtooth', 0.4); // Bad sound
        screenShake();
        resetBall();
    } else if (ball.x + ball.radius > INTERNAL_WIDTH) {
        user.score++;
        playSound(800, 'sine', 0.3, 0.2); // Good sound
        spawnParticles(ball.x, ball.y, COLOR_PLAYER, 30); // Confetti-ish
        screenShake();
        resetBall();
    }

    // 6. Paddle AI
    // Lerp towards ball
    let targetY = ball.y - com.height / 2;
    // Add intentional delay/error based on speed
    let lerpFactor = 0.08;
    com.y += (targetY - com.y) * lerpFactor;

    // Constrain AI
    if (com.y < 0) com.y = 0;
    if (com.y + com.height > INTERNAL_HEIGHT) com.y = INTERNAL_HEIGHT - com.height;

    // 7. Paddle Collision
    let player = (ball.x < INTERNAL_WIDTH / 2) ? user : com;

    if (collision(ball, player)) {
        playSound(400, 'square', 0.1);

        // Collision Logic
        let collidePoint = (ball.y - (player.y + player.height / 2));
        collidePoint = collidePoint / (player.height / 2);
        let angleRad = (Math.PI / 4) * collidePoint;
        let direction = (ball.x < INTERNAL_WIDTH / 2) ? 1 : -1;

        ball.velocityX = direction * ball.speed * Math.cos(angleRad);
        ball.velocityY = ball.speed * Math.sin(angleRad);
        ball.speed += 0.5;

        // VFX
        spawnParticles(ball.x, ball.y, player.color, 12);
        screenShake();
    }

    // Check Win
    if (user.score >= WIN_SCORE || com.score >= WIN_SCORE) {
        gameOver();
    }
}

function collision(b, p) {
    p.top = p.y;
    p.bottom = p.y + p.height;
    p.left = p.x;
    p.right = p.x + p.width;

    b.top = b.y - b.radius;
    b.bottom = b.y + b.radius;
    b.left = b.x - b.radius;
    b.right = b.x + b.radius;

    return p.left < b.right && p.top < b.bottom && p.right > b.left && p.bottom > b.top;
}

// --- Rendering ---

function drawRect(x, y, w, h, color, shadowBlur = 0) {
    ctx.fillStyle = color;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowColor = color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0; // Reset
}

function drawCircle(x, y, r, color, shadowBlur = 0) {
    ctx.fillStyle = color;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawNet() {
    ctx.fillStyle = "#222";
    for (let i = 0; i <= INTERNAL_HEIGHT; i += 30) {
        ctx.fillRect(net.x, i, net.width, 15);
    }
}

function drawScore(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = "50px 'Press Start 2P'";
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
}

function render() {
    // Clear with fade effect for slight ghosting if desired, or solid clear
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    // Apply Screen Shake
    ctx.save();
    if (shakeDuration > 0) {
        let dx = Math.random() * 10 - 5;
        let dy = Math.random() * 10 - 5;
        ctx.translate(dx, dy);
        shakeDuration--;
    }

    // Draw Net
    drawNet();

    // Draw Score
    drawScore(user.score, INTERNAL_WIDTH / 4, 80, COLOR_PLAYER);
    drawScore(com.score, 3 * INTERNAL_WIDTH / 4, 80, COLOR_COM);

    // Draw Paddles (With Glow)
    drawRect(user.x, user.y, user.width, user.height, user.color, 20);
    drawRect(com.x, com.y, com.width, com.height, com.color, 20);

    // Draw Trail
    for (let i = 0; i < ball.trail.length; i++) {
        let pos = ball.trail[i];
        let alpha = i / ball.trail.length; // Fades out
        // Using rgba for transparent trail
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ball.radius * (alpha * 0.8), 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Ball (With Glow)
    drawCircle(ball.x, ball.y, ball.radius, ball.color, 20);

    // Draw Particles
    particles.forEach(p => p.draw(ctx));

    ctx.restore();
}

function gameLoop() {
    if (!gameRunning) return;
    update();
    render();
    animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);

    const winner = user.score >= WIN_SCORE;
    const h1 = uiLayer.querySelector('h1');

    h1.innerHTML = winner ?
        `<span style="color:${COLOR_WON}">YOU WON</span>` :
        `<span style="color:${COLOR_COM}">GAME OVER</span>`;

    startBtn.textContent = "PLAY AGAIN";
    uiLayer.classList.remove('hidden');
}

function startGame() {
    user.score = 0;
    com.score = 0;
    user.y = INTERNAL_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    com.y = INTERNAL_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    resetBall();
    gameRunning = true;
    uiLayer.classList.add('hidden');

    if (audioCtx.state === 'suspended') audioCtx.resume();
    gameLoop();
}

// --- Inputs ---

// Mouse
canvas.addEventListener("mousemove", evt => {
    let rect = canvas.getBoundingClientRect();
    let scaleY = INTERNAL_HEIGHT / rect.height;
    let val = (evt.clientY - rect.top) * scaleY - PADDLE_HEIGHT / 2;
    user.y = Math.max(0, Math.min(INTERNAL_HEIGHT - PADDLE_HEIGHT, val));
});

// Touch
canvas.addEventListener("touchmove", evt => {
    evt.preventDefault();
    let rect = canvas.getBoundingClientRect();
    let scaleY = INTERNAL_HEIGHT / rect.height;
    let touch = evt.touches[0];
    let val = (touch.clientY - rect.top) * scaleY - PADDLE_HEIGHT / 2;
    user.y = Math.max(0, Math.min(INTERNAL_HEIGHT - PADDLE_HEIGHT, val));
}, { passive: false });

// Keyboard
document.addEventListener("keydown", evt => {
    if (!gameRunning) return;
    const speed = 40;
    if (evt.key === 'w' || evt.key === 'ArrowUp') {
        user.y = Math.max(0, user.y - speed);
    } else if (evt.key === 's' || evt.key === 'ArrowDown') {
        user.y = Math.min(INTERNAL_HEIGHT - user.height, user.y + speed);
    }
});

startBtn.addEventListener("click", startGame);
render(); // Initial paint

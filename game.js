let currentScreen = 'role-selection';
let currentUser = null;
let gameState = {
    role: null,
    roomCode: null,
    probability: 50,
    maxAttempts: 5,
    attemptsLeft: 5,
    totalFlips: 0,
    headsCount: 0,
    autoFlipActive: false,
    autoFlipInterval: null,
    autoFlipMode: 1 // 1, 10, 100, 1000
};

// Google 로그인
async function signInWithGoogle() {
    try {
        const provider = new window.GoogleAuthProvider();
        const result = await window.signInWithPopup(window.firebaseAuth, provider);
        currentUser = result.user;
        
        // 로그인 성공 시 UI 업데이트
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('game-setup').style.display = 'block';
        document.getElementById('user-name').textContent = currentUser.displayName;
        
        showMessage('success', '✅', `환영합니다, ${currentUser.displayName}님!`);
    } catch (error) {
        console.error('로그인 실패:', error);
        showMessage('error', '❌', '로그인에 실패했습니다. 다시 시도해주세요.');
    }
}

// 게임 방 생성 (Firestore에 저장)
async function createGameRoom() {
    if (!currentUser) {
        showMessage('error', '❌', '로그인이 필요합니다!');
        return;
    }
    
    const probability = parseInt(document.getElementById('probability').value);
    const maxAttempts = parseInt(document.getElementById('max-attempts').value);
    
    gameState.probability = probability;
    gameState.maxAttempts = maxAttempts;
    gameState.attemptsLeft = maxAttempts;
    gameState.roomCode = generateRoomCode();
    
    try {
        // Firestore에 방 정보 저장 (roomCode를 문서 ID로 사용)
        const roomRef = window.firestoreDoc(window.firebaseDb, 'rooms', gameState.roomCode);
        await window.firestoreSetDoc(roomRef, {
            roomCode: gameState.roomCode,
            creatorId: currentUser.uid,
            creatorName: currentUser.displayName,
            probability: probability,
            maxAttempts: maxAttempts,
            createdAt: new Date().toISOString(),
            active: true
        });
        
        console.log('방 생성 완료:', gameState.roomCode);
        document.getElementById('room-code').textContent = gameState.roomCode;
        document.getElementById('room-code-display').style.display = 'block';
        
        showMessage('success', '🎉', '게임 방이 생성되었습니다!');
    } catch (error) {
        console.error('방 생성 실패:', error);
        showMessage('error', '❌', '방 생성에 실패했습니다. 다시 시도해주세요.');
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
}

function selectRole(role) {
    gameState.role = role;
    if (role === 'maker') {
        showScreen('maker-setup');
    } else {
        showScreen('detective-join');
    }
}

function backToRoleSelection() {
    // 성공 메시지와 추측 섹션 초기화
    const guessSection = document.getElementById('guess-section');
    const successMessage = document.getElementById('success-message');
    if (guessSection) guessSection.classList.remove('hidden');
    if (successMessage) successMessage.classList.add('hidden');
    
    // 제작자 화면 초기화 (로그인은 유지)
    if (currentUser) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('game-setup').style.display = 'block';
        document.getElementById('room-code-display').style.display = 'none';
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('game-setup').style.display = 'none';
    }
    
    showScreen('role-selection');
    resetGameState();
}

function resetGameState() {
    gameState = {
        role: null,
        roomCode: null,
        probability: 50,
        maxAttempts: 5,
        attemptsLeft: 5,
        totalFlips: 0,
        headsCount: 0,
        autoFlipActive: false,
        autoFlipInterval: null,
        autoFlipMode: 1
    };
}

// 확률 입력값 실시간 업데이트
document.addEventListener('DOMContentLoaded', () => {
    const probabilityInput = document.getElementById('probability');
    const probabilityValue = document.getElementById('probability-value');
    
    if (probabilityInput) {
        probabilityInput.addEventListener('input', (e) => {
            probabilityValue.textContent = e.target.value;
        });
    }
});

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function joinGame() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    
    if (!code) {
        showMessage('error', '❌', '입장 코드를 입력해주세요!');
        return;
    }
    
    try {
        console.log('입장 시도:', code);
        
        // Firestore에서 방 정보 가져오기 (문서 ID로 직접 조회)
        const roomRef = window.firestoreDoc(window.firebaseDb, 'rooms', code);
        const roomSnap = await window.firestoreGetDoc(roomRef);
        
        if (!roomSnap.exists()) {
            console.log('방을 찾을 수 없음:', code);
            showMessage('error', '❌', '존재하지 않는 입장 코드입니다!');
            return;
        }
        
        const room = roomSnap.data();
        console.log('방 정보 로드:', room);
        
        if (!room.active) {
            showMessage('error', '❌', '비활성화된 방입니다!');
            return;
        }
        
        gameState.roomCode = code;
        gameState.probability = room.probability;
        gameState.maxAttempts = room.maxAttempts;
        gameState.attemptsLeft = room.maxAttempts;
        
        document.getElementById('attempts-left').textContent = gameState.attemptsLeft;
        showScreen('game-screen');
        showMessage('success', '✅', '게임에 참여했습니다!');
    } catch (error) {
        console.error('입장 실패:', error);
        showMessage('error', '❌', `게임 입장에 실패했습니다: ${error.message}`);
    }
}

function flipCoinOnce() {
    return new Promise((resolve) => {
        const coin = document.getElementById('coin');
        
        // batchSize만큼 결과 계산
        const batchSize = gameState.autoFlipMode;
        let headsInBatch = 0;
        
        // batchSize번 던지기 결과 계산
        for (let i = 0; i < batchSize; i++) {
            const isHeads = Math.random() * 100 < gameState.probability;
            if (isHeads) headsInBatch++;
        }
        
        // 마지막 결과에 따라 동전 면 결정 (확률적으로)
        const showHeads = Math.random() * 100 < gameState.probability;
        
        coin.classList.add('flipping');
        
        setTimeout(() => {
            coin.classList.remove('flipping');
            if (showHeads) {
                coin.classList.remove('show-back');
            } else {
                coin.classList.add('show-back');
            }
            
            // 통계에 batchSize만큼 추가
            gameState.totalFlips += batchSize;
            gameState.headsCount += headsInBatch;
            updateStats();
            
            resolve();
        }, 400); // 0.4초 애니메이션
    });
}

function updateStats() {
    document.getElementById('total-flips').textContent = gameState.totalFlips;
    document.getElementById('heads-count').textContent = gameState.headsCount;
}

function checkAndUpgradeMode() {
    const total = gameState.totalFlips;
    const autoBtn = document.getElementById('auto-flip-btn');
    const btnText = autoBtn.querySelector('.btn-text');
    
    // 100번 도달 -> 10번씩 던지기 모드로 업그레이드
    if (total >= 100 && gameState.autoFlipMode === 1) {
        stopAutoFlip();
        gameState.autoFlipMode = 10;
        if (btnText) btnText.textContent = '자동 10번씩 던지기';
        return true;
    } 
    // 1000번 도달 -> 100번씩 던지기 모드로 업그레이드
    else if (total >= 1000 && gameState.autoFlipMode === 10) {
        stopAutoFlip();
        gameState.autoFlipMode = 100;
        if (btnText) btnText.textContent = '자동 100번씩 던지기';
        return true;
    } 
    // 10000번 도달 -> 1000번씩 던지기 모드로 업그레이드
    else if (total >= 10000 && gameState.autoFlipMode === 100) {
        stopAutoFlip();
        gameState.autoFlipMode = 1000;
        if (btnText) btnText.textContent = '자동 1000번씩 던지기';
        return true;
    }
    return false;
}

function toggleAutoFlip() {
    if (gameState.autoFlipActive) {
        stopAutoFlip();
    } else {
        startAutoFlip();
    }
}

async function startAutoFlip() {
    gameState.autoFlipActive = true;
    const autoBtn = document.getElementById('auto-flip-btn');
    const btnText = autoBtn.querySelector('.btn-text');
    const btnIcon = autoBtn.querySelector('.btn-icon');
    
    if (btnText) btnText.textContent = '던지는 중... (클릭하면 중지)';
    if (btnIcon) btnIcon.textContent = '⏸';
    
    while (gameState.autoFlipActive) {
        await flipCoinOnce(); // 0.4초 애니메이션, 내부적으로 N번 계산
        
        // 모드 업그레이드 체크 (100, 1000, 10000번 도달 시)
        if (checkAndUpgradeMode()) {
            return; // 업그레이드 시 자동 던지기 중지
        }
        
        // 0.2초 대기 후 다음 던지기
        if (gameState.autoFlipActive) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
}

function stopAutoFlip() {
    gameState.autoFlipActive = false;
    
    const autoBtn = document.getElementById('auto-flip-btn');
    const btnText = autoBtn.querySelector('.btn-text');
    const btnIcon = autoBtn.querySelector('.btn-icon');
    
    if (btnIcon) btnIcon.textContent = '▶';
    
    if (gameState.autoFlipMode === 1) {
        if (btnText) btnText.textContent = '자동 던지기 시작';
    } else {
        if (btnText) btnText.textContent = `자동 ${gameState.autoFlipMode}번씩 던지기`;
    }
}

function submitGuess() {
    const guess = parseInt(document.getElementById('guess').value);
    
    if (isNaN(guess) || guess < 0 || guess > 100) {
        showMessage('error', '⚠️', '0에서 100 사이의 값을 입력해주세요!');
        return;
    }
    
    if (guess === gameState.probability) {
        // 추측 섹션 숨기고 성공 메시지 표시
        document.getElementById('guess-section').classList.add('hidden');
        const successMessage = document.getElementById('success-message');
        const successText = document.getElementById('success-text');
        successMessage.classList.remove('hidden');
        successText.innerHTML = `실제 확률은 <strong>${gameState.probability}%</strong>였습니다.<br>총 <strong>${gameState.totalFlips}번</strong> 던져서 <strong>${gameState.headsCount}번</strong> 앞면이 나왔습니다.<br><br>계속 동전을 던져보세요!`;
        // 게임 화면 유지, 계속 동전 던지기 가능
    } else {
        gameState.attemptsLeft--;
        document.getElementById('attempts-left').textContent = gameState.attemptsLeft;
        
        if (gameState.attemptsLeft <= 0) {
            showLoseScreen();
        } else {
            showMessage('error', '❌', `틀렸습니다!\n남은 시도: ${gameState.attemptsLeft}회`);
        }
    }
    
    document.getElementById('guess').value = '';
}

function showMessage(type, icon, text) {
    const overlay = document.getElementById('overlay');
    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    
    messageBox.className = 'message-box ' + type;
    messageIcon.textContent = icon;
    messageText.textContent = text;
    
    overlay.classList.add('show');
    messageBox.classList.add('show');
}

function closeMessage() {
    const overlay = document.getElementById('overlay');
    const messageBox = document.getElementById('message-box');
    
    overlay.classList.remove('show');
    messageBox.classList.remove('show');
}

function showWinScreen() {
    stopAutoFlip();
    
    const resultContent = document.getElementById('result-content');
    resultContent.innerHTML = `
        <div class="result-icon">🎉</div>
        <div class="result-message">정답입니다!</div>
        <div class="result-stats">
            <p><strong>정답 확률:</strong> ${gameState.probability}%</p>
            <p><strong>총 던진 횟수:</strong> ${gameState.totalFlips}회</p>
            <p><strong>앞면 나온 횟수:</strong> ${gameState.headsCount}회</p>
            <p><strong>사용한 시도:</strong> ${gameState.maxAttempts - gameState.attemptsLeft}회</p>
        </div>
    `;
    
    showScreen('result-screen');
}

function showLoseScreen() {
    stopAutoFlip();
    
    const resultContent = document.getElementById('result-content');
    resultContent.innerHTML = `
        <div class="result-icon">😢</div>
        <div class="result-message">게임 실패!</div>
        <div class="result-stats">
            <p><strong>정답 확률:</strong> ${gameState.probability}%</p>
            <p><strong>총 던진 횟수:</strong> ${gameState.totalFlips}회</p>
            <p><strong>앞면 나온 횟수:</strong> ${gameState.headsCount}회</p>
            <p>모든 시도 기회를 사용했습니다.</p>
        </div>
    `;
    
    showScreen('result-screen');
}

function resetGame() {
    resetGameState();
    showScreen('role-selection');
}

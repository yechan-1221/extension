const params = new URLSearchParams(window.location.search);
const type = params.get('type');

const titleEl = document.getElementById('title');
const messageEl = document.getElementById('message');
const timerEl = document.getElementById('timer-display');
const closeBtn = document.getElementById('close-btn');

const config = {
    start: { title: "🔋 근무 시작", message: "오늘도 좋은 하루 되세요! 올바른 자세를 유지하세요!", color: "#2ecc71" },
    end: { title: "🛑 근무 종료", message: "오늘 하루도 고생하셨습니다. 로그를 저장합니다.", color: "#3498db" },
    error: { title: "⚠️ 연결 오류", message: "로컬 서버와의 연결이 끊어졌습니다.", color: "#e74c3c" }
};

const current = config[type] || config.error;
titleEl.innerText = current.title;
messageEl.innerText = current.message;
document.body.style.borderTopColor = current.color;

// 닫기 버튼 클릭 시 창 닫기
closeBtn.onclick = () => window.close();

// 'end' 타입일 경우에만 10초 카운트다운 적용
if (type === 'end') {
    let timeLeft = 10;
    timerEl.innerText = `${timeLeft}초 후 자동으로 닫힙니다.`;
    
    const countdown = setInterval(() => {
        timeLeft--;
        timerEl.innerText = `${timeLeft}초 후 자동으로 닫힙니다.`;
        if (timeLeft <= 0) {
            clearInterval(countdown);
            window.close();
        }
    }, 1000);
}
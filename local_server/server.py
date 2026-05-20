import json
import os
import subprocess
import webbrowser
import platform
import sys # sys 모듈 추가
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# PyInstaller 환경에서 올바른 경로를 찾기 위한 처리
if getattr(sys, 'frozen', False):
    # .exe 파일로 실행될 때의 경로
    application_path = os.path.dirname(sys.executable)
else:
    # 파이썬 스크립트로 실행될 때의 경로
    application_path = os.path.dirname(__file__)

STATUS_FILE = os.path.join(application_path, 'session_state.json')

def read_state():
    if not os.path.exists(STATUS_FILE):
        return {"status": "INACTIVE"}
    with open(STATUS_FILE, 'r') as f:
        return json.load(f)

def launch_chrome():
    """크롬을 실행하고 익스텐션 팝업이 뜨도록 빈 탭을 염"""
    print('[OS Control] 크롬 브라우저 실행 중...')
    # 크롬 실행 경로 (삼성 노트북 기본 경로)
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    if os.path.exists(chrome_path):
        subprocess.Popen([chrome_path, '--new-window', 'about:blank'])
    else:
        # 경로가 다를 경우 기본 브라우저로 열기
        webbrowser.open('about:blank')
    print('[OS Control] 크롬 실행 완료!')

def sleep_system():
    """PC를 절전 모드로 전환"""
    print('[OS Control] 절전 모드 전환 중...')
    # 하이브리드 절전 비활성화 후 절전 모드 전환
    os.system('powercfg /hibernate off')
    os.system('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')

@app.route('/session-status', methods=['GET'])
def get_status():
    return jsonify(read_state())

@app.route('/toggle-tag', methods=['GET', 'POST'])
def toggle_tag():
    current = read_state()
    new_status = "ACTIVE" if current.get("status") == "INACTIVE" else "INACTIVE"

    with open(STATUS_FILE, 'w') as f:
        json.dump({"status": new_status}, f)

    if new_status == "ACTIVE":
        # 출근 태그: 크롬 자동 실행
        launch_chrome()
        return jsonify({"msg": "ACTIVE: 크롬 실행됨", "status": new_status})
    else:
        # 퇴근 태그: INACTIVE만 변경 (절전은 /shutdown 호출 후)
        return jsonify({"msg": "INACTIVE: 종료 대기 중", "status": new_status})

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """익스텐션이 로그 전송 완료 후 호출하는 절전 엔드포인트"""
    import threading
    # 3초 후 절전 (응답을 먼저 보내고 절전)
    threading.Timer(3.0, sleep_system).start()
    return jsonify({"msg": "3초 후 절전 모드로 전환됩니다."})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
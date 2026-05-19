# 🔄 NFC 자동화 세팅 가이드

> NFC 태깅 한 번으로 크롬 실행 → 익스텐션 가동, 퇴근 태깅으로 로그 전송 → 크롬 종료 → PC 절전까지 자동화하는 세팅 방법이에요.

---

## 📋 목차

1. [사전 준비](#1-사전-준비)
2. [파일 구조 세팅](#2-파일-구조-세팅)
3. [시작프로그램 등록](#3-시작프로그램-등록)
4. [아이폰 단축어 설정](#4-아이폰-단축어-설정)
5. [정상 동작 확인](#5-정상-동작-확인)
6. [주의사항](#6-주의사항)

---

## 1. 사전 준비

### Python 설치

Python이 설치되어 있어야 Flask 서버가 실행돼요.

1. [https://www.python.org/downloads/](https://www.python.org/downloads/) 에서 Python 설치
2. 설치 시 **"Add Python to PATH"** 체크 필수!
3. 설치 확인:
```bash
python --version
```

### 필요한 패키지 설치

```bash
pip install flask flask-cors
```

---

## 2. 파일 구조 세팅

### 폴더 구조

아래와 같이 폴더를 만들어주세요:

```
C:\Users\[내 PC 이름]\upright_ai\
    ├── local_server\
    │   ├── server.py
    │   └── session_state.json
    └── start_upright.bat
```

> ⚠️ `[내 PC 이름]` 부분은 본인 PC 사용자 이름으로 바꿔주세요.
> 예: `C:\Users\EL092\upright_ai\`

### `session_state.json` 생성

`local_server\` 폴더 안에 `session_state.json` 파일을 만들고 아래 내용을 넣어주세요:

```json
{"status": "INACTIVE"}
```

### `start_upright.bat` 수정

`start_upright.bat` 파일을 열어서 **첫 번째 줄의 경로를 본인 경로로 수정**해주세요:

```bat
@echo off
cd /d C:\Users\[내 PC 이름]\upright_ai
start /min python local_server/server.py
timeout /t 3 /nobreak
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window
```

---

## 3. 시작프로그램 등록

PC가 켜질 때 Flask 서버와 크롬이 자동으로 실행되도록 등록해요.

1. 윈도우 키 + R 누르기
2. `shell:startup` 입력 후 Enter
3. 열린 폴더에 `start_upright.bat` 복사 붙여넣기

> ✅ 이제 PC 켜질 때마다 Flask 서버와 크롬이 자동으로 실행돼요!

---

## 4. 아이폰 단축어 설정

### 노트북 IP 확인

```
윈도우 키 + R → cmd → ipconfig
```
**IPv4 주소** 항목 값을 메모해두세요. (예: `172.20.10.4`)

> ⚠️ 아이폰 핫스팟에 노트북을 연결한 상태에서 확인해야 해요.
> 와이파이 재연결 시 IP가 바뀔 수 있으니 그때마다 업데이트 필요해요.

### 단축어 앱 설정

1. 아이폰 **단축어** 앱 열기
2. 새 단축어 만들기
3. **"URL 내용 가져오기"** 액션 추가
4. URL에 아래 입력:
```
http://[노트북 IP]:5000/toggle-tag
```
예: `http://172.20.10.4:5000/toggle-tag`

5. 방법: **POST**로 설정
6. NFC 태그에 단축어 연결

---

## 5. 정상 동작 확인

### Flask 서버 동작 확인

브라우저에서 아래 주소 열기:
```
http://localhost:5000/session-status
```

아래처럼 뜨면 정상이에요 ✅
```json
{"status": "INACTIVE"}
```

### 전체 흐름 테스트

**출근 테스트:**
1. 아이폰으로 NFC 태그
2. 팝업 + 웹캠 켜지는지 확인

**퇴근 테스트:**
1. 아이폰으로 NFC 태그
2. 로그 전송 확인
3. 15초 후 크롬 자동 종료 확인
4. PC 절전 모드 전환 확인

---

## 6. 주의사항

| 항목 | 내용 |
|---|---|
| 아이폰 핫스팟 | 아이폰과 노트북이 같은 네트워크에 있어야 해요. 학교/회사 와이파이는 기기 간 통신이 막혀 있을 수 있어서 아이폰 핫스팟 사용을 권장해요. |
| IP 변동 | 핫스팟 재연결 시 노트북 IP가 바뀔 수 있어요. `ipconfig`로 확인 후 단축어 URL 업데이트 필요해요. |
| Python 필수 | 사용자 PC에 Python이 설치되어 있어야 Flask 서버가 실행돼요. |
| 완전 꺼진 PC | 삼성 노트북은 WOL을 지원하지 않아서 완전히 꺼진 상태에서 NFC로 켜는 건 불가능해요. 절전 모드 활용을 권장해요. |
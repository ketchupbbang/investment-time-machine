# 🎢 장기 투자자 시뮬레이터

과거 시점으로 돌아가 적립식 투자의 등락을 체험해볼 수 있는 웹 시뮬레이터입니다.

## ✨ 주요 기능

### 📊 투자 시뮬레이션
- **적립식 투자 체험**: 초기 거치금 + 정기 입금으로 장기 투자 시뮬레이션
- **입금 주기 선택**: 매월(월초) 또는 매주(월요일) 입금
- **년도별 입금액 설정**: 각 년도마다 다른 입금액 설정 가능
- **자동 증액 옵션**: 매년 n% 자동 증액 기능
- **배당금 재투자 (DRIP)**: 배당금 자동 재투자 + 누적 배당금 추적
- **액면분할 반영**: 주식 분할 시 보유 수량 자동 조정

### ⏱️ 시뮬레이션 컨트롤
- **속도 조절**: ms 단위 직접 입력
- **날짜 점프**: 특정 날짜로 바로 이동
- **1년 점프**: 버튼 한 번으로 1년 스킵
- **키보드 컨트롤**: `Space` 일시정지, `←` `→` 하루씩 이동

### 📜 투자 기록
- **실시간 로그**: 배당금 재투자, 액면분할, 정기 입금 기록
- **역사적 사건 알림**: 리먼 사태, 코로나 폭락 등 주요 이벤트 표시

### ✏️ 커스텀 종목
- **직접 입력**: `stock_data/` 폴더에 yfinance CSV를 넣어두면 어떤 종목이든 시뮬레이션 가능
- **Yahoo Finance API**: 로컬 서버 환경에서 티커 입력만으로 자동 데이터 수집

## 📁 기본 제공 종목

| 티커 | 설명 | 레버리지 |
|------|------|----------|
| VOO | S&P 500 ETF | 1배 |
| SSO | S&P 500 ETF | 2배 |
| SPXL | S&P 500 ETF | 3배 |
| QQQ | 나스닥 100 ETF | 1배 |
| QLD | 나스닥 100 ETF | 2배 |
| TQQQ | 나스닥 100 ETF | 3배 |

## 🚀 실행 방법

### 방법 1: VS Code Live Server (추천)
1. VS Code에서 프로젝트 폴더 열기
2. `index.html` 우클릭 → **Open with Live Server**

### 방법 2: Python 내장 서버
```bash
cd investment-time-machine
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 접속

### 방법 3: GitHub Pages
기본 6종목은 바로 사용 가능합니다.

> ⚠️ **GitHub Pages에서는 직접 입력 기능을 사용할 수 없습니다.** 커스텀 종목을 추가하려면 로컬 서버 환경을 이용하세요.

## ➕ 종목 추가하기

1. [Yahoo Finance](https://finance.yahoo.com)에서 원하는 종목의 Historical Data를 yfinance 형식 CSV로 준비
2. `stock_data/` 폴더에 `TICKER.csv` 형식으로 저장 (예: `AAPL.csv`)
3. 시뮬레이터에서 **직접 입력** → 티커 심볼 입력 → 📥 데이터 불러오기

또는 Python yfinance로 직접 다운로드:
```python
import yfinance as yf
df = yf.download("AAPL", period="max")
df.to_csv("stock_data/AAPL.csv")
```

## 📂 프로젝트 구조

```
investment-time-machine/
├── index.html              # 메인 HTML
├── style.css               # 스타일시트
├── script.js               # 메인 JavaScript
├── stock_data/             # 주식 데이터 (CSV)
│   ├── VOO.csv
│   ├── SSO.csv
│   ├── SPXL.csv
│   ├── QQQ.csv
│   ├── QLD.csv
│   └── TQQQ.csv
├── events/                 # 역사적 사건 데이터
│   └── historical_events.csv
└── README.md
```

## 🛠️ 기술 스택

- **HTML5 / CSS3 / JavaScript (Vanilla)** — 프레임워크 없음
- **Chart.js** — 차트 시각화
- **Yahoo Finance API** — 커스텀 종목 데이터 수집 (로컬 서버 환경)

## ⚠️ 주의사항

- 이 시뮬레이터는 **교육 목적**으로 제작되었습니다.
- 과거 수익률이 미래 수익률을 보장하지 않습니다.
- 실제 투자 결정은 전문가와 상담 후 신중하게 진행하세요.

## 📄 라이선스

MIT License

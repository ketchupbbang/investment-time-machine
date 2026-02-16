// --- 전역 변수 ---
let stockData = [];
let currentIndex = 0;
let timer = null;
let isPaused = false;
let speed = 50;

// 티커별 데이터 범위 캐시
let tickerDataRanges = {};
// race condition 방지
let tickerInfoUpdateId = 0;

// 커스텀 티커 CSV 데이터 (인메모리 + localStorage 캐시)
let customTickerCSV = null;
let customTickerSymbol = '';

// --- localStorage 캐시 헬퍼 ---
function saveToCacheStorage(ticker, csvData) {
    try {
        const key = `ticker_csv_${ticker.toUpperCase()}`;
        localStorage.setItem(key, csvData);
        localStorage.setItem(`${key}_ts`, Date.now().toString());
    } catch (e) {
        console.warn('localStorage 저장 실패:', e);
    }
}

function loadFromCacheStorage(ticker) {
    try {
        const key = `ticker_csv_${ticker.toUpperCase()}`;
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function getCacheTimestamp(ticker) {
    try {
        const key = `ticker_csv_${ticker.toUpperCase()}_ts`;
        const ts = localStorage.getItem(key);
        return ts ? parseInt(ts) : null;
    } catch (e) {
        return null;
    }
}

// 역사적 사건 데이터 (CSV에서 로드)
let historicalEvents = {};

// 년도별 입금액 설정
let yearlyDeposits = {};

// GitHub Pages 여부 감지
const isGitHubPages = location.hostname.includes('github.io');

// 주 번호 계산 헬퍼 함수
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() * 100 + weekNo;
}

// 포트폴리오 상태
let portfolio = {
    cash: 0,
    shares: 0,
    totalInvested: 0,
    totalDividends: 0,
    currentDepositAmount: 0,
    lastDepositMonth: -1,
    lastDepositWeek: -1
};

// 차트 객체
let chartInstance = null;

// UI 엘리먼트 캐싱
const els = {
    setupScreen: document.getElementById('setup-screen'),
    simScreen: document.getElementById('simulation-screen'),
    tickerSelect: document.getElementById('tickerSelect'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    initialDeposit: document.getElementById('initialDeposit'),
    regularDeposit: document.getElementById('regularDeposit'),
    frequency: document.getElementById('frequency'),
    tickerDateInfo: document.getElementById('tickerDateInfo'),

    // 년도별 설정 모달
    openYearlySettingBtn: document.getElementById('openYearlySettingBtn'),
    yearlyModal: document.getElementById('yearlyModal'),
    yearlyInputs: document.getElementById('yearlyInputs'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    saveYearlyBtn: document.getElementById('saveYearlyBtn'),
    autoIncreaseRate: document.getElementById('autoIncreaseRate'),
    applyAutoIncreaseBtn: document.getElementById('applyAutoIncreaseBtn'),

    // 컨트롤 패널
    jumpDate: document.getElementById('jumpDate'),
    jumpBtn: document.getElementById('jumpBtn'),
    speedInput: document.getElementById('speedInput'),
    applySpeedBtn: document.getElementById('applySpeedBtn'),

    // 커스텀 티커
    customTickerArea: document.getElementById('customTickerArea'),
    customTickerInput: document.getElementById('customTickerInput'),
    fetchTickerBtn: document.getElementById('fetchTickerBtn'),
    tickerFetchStatus: document.getElementById('tickerFetchStatus'),
    ghPagesNotice: document.getElementById('ghPagesNotice'),
    csvDownloadArea: document.getElementById('csvDownloadArea'),
    downloadCsvBtn: document.getElementById('downloadCsvBtn'),

    // 시뮬레이션 출력
    displayTicker: document.getElementById('displayTicker'),
    simDate: document.getElementById('simDate'),
    totalValue: document.getElementById('totalValue'),
    returnRate: document.getElementById('returnRate'),
    totalShares: document.getElementById('totalShares'),
    totalInvested: document.getElementById('totalInvested'),
    totalDividends: document.getElementById('totalDividends'),
    profitLoss: document.getElementById('profitLoss'),
    logList: document.getElementById('logList'),

    // 버튼
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    skipBtn: document.getElementById('skipBtn'),
    resetBtn: document.getElementById('resetBtn')
};

// =============================================
// 0. 초기화
// =============================================

// 역사적 사건 데이터 CSV 로드
async function loadHistoricalEvents() {
    try {
        const resp = await fetch('./events/historical_events.csv');
        if (!resp.ok) return;
        const text = await resp.text();
        const lines = text.trim().split('\n');
        // 헤더: Date,Emoji,Description
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length >= 3) {
                const date = cols[0].trim();
                const emoji = cols[1].trim();
                const desc = cols.slice(2).join(',').trim();
                historicalEvents[date] = `${emoji} ${desc}`;
            }
        }
    } catch (e) {
        console.warn('[init] 역사적 사건 데이터 로드 실패:', e);
    }
}

// 티커 데이터 범위 로드
async function loadTickerDateRange(ticker) {
    try {
        const response = await fetch(`./stock_data/${ticker}.csv`);
        if (!response.ok) return null;
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return null;
        const headers = lines[0].split(',');
        const idxDate = headers.findIndex(h => h.includes('Date'));
        const firstRow = lines[1].split(',');
        const lastRow = lines[lines.length - 1].split(',');
        return { minDate: firstRow[idxDate], maxDate: lastRow[idxDate] };
    } catch (e) {
        return null;
    }
}

async function updateTickerDateInfo() {
    const ticker = els.tickerSelect.value;
    const myUpdateId = ++tickerInfoUpdateId;

    if (ticker === '__custom__') {
        if (customTickerCSV && customTickerSymbol) {
            const range = tickerDataRanges['__custom__'];
            if (range) {
                els.tickerDateInfo.textContent = `📅 데이터 기간: ${range.minDate} ~ ${range.maxDate}`;
            } else {
                els.tickerDateInfo.textContent = '📅 티커를 입력하고 데이터를 불러오세요.';
            }
        } else {
            els.tickerDateInfo.textContent = '📅 티커를 입력하고 데이터를 불러오세요.';
        }
        return;
    }

    els.tickerDateInfo.textContent = '📅 데이터 기간: 로딩중...';

    if (!tickerDataRanges[ticker]) {
        tickerDataRanges[ticker] = await loadTickerDateRange(ticker);
    }

    if (myUpdateId !== tickerInfoUpdateId) return;

    const range = tickerDataRanges[ticker];
    if (range) {
        els.tickerDateInfo.textContent = `📅 데이터 기간: ${range.minDate} ~ ${range.maxDate}`;
        els.startDate.value = range.minDate;
        els.endDate.value = range.maxDate;
    } else {
        els.tickerDateInfo.textContent = '📅 데이터를 불러올 수 없습니다.';
    }
}

// 페이지 로드 시 초기화
(async () => {
    try { await loadHistoricalEvents(); } catch (e) { console.error(e); }
    try { updateTickerDateInfo(); } catch (e) { console.error(e); }
})();

// =============================================
// 1. 티커 선택 & 커스텀 티커
// =============================================

els.tickerSelect.addEventListener('change', () => {
    const val = els.tickerSelect.value;
    tickerInfoUpdateId++;

    els.customTickerArea.classList.add('hidden');
    els.tickerFetchStatus.classList.add('hidden');
    els.ghPagesNotice.classList.add('hidden');
    els.csvDownloadArea.classList.add('hidden');

    if (val === '__custom__') {
        els.customTickerArea.classList.remove('hidden');
        els.tickerDateInfo.textContent = '📅 티커를 입력하고 데이터를 불러오세요.';
        // GitHub Pages인 경우 안내문 표시
        if (isGitHubPages) {
            els.ghPagesNotice.classList.remove('hidden');
        }
    } else {
        customTickerCSV = null;
        customTickerSymbol = '';
        updateTickerDateInfo();
    }
});

// 커스텀 티커 데이터 불러오기
els.fetchTickerBtn.addEventListener('click', async () => {
    const ticker = els.customTickerInput.value.trim().toUpperCase();
    if (!ticker) {
        alert('티커 심볼을 입력해주세요.');
        return;
    }

    els.fetchTickerBtn.disabled = true;
    els.fetchTickerBtn.textContent = '⏳ 로딩중...';
    els.tickerFetchStatus.classList.remove('hidden');
    els.tickerFetchStatus.textContent = `${ticker} 데이터를 불러오는 중...`;
    els.tickerFetchStatus.className = 'ticker-fetch-status';

    try {
        // 1단계: Yahoo Finance API로 최신 데이터 시도
        let csvData = null;
        let source = '';
        try {
            csvData = await fetchTickerFromYahoo(ticker);
            source = 'yahoo';
        } catch (e) { /* Yahoo 실패 → 폴백 */ }

        // 2단계: Yahoo 실패 시 localStorage 캐시 확인
        if (!csvData) {
            const cached = loadFromCacheStorage(ticker);
            if (cached) {
                const lines = cached.trim().split('\n');
                if (lines.length >= 10) {
                    csvData = cached;
                    source = 'cache';
                }
            }
        }

        // 3단계: 캐시도 없으면 stock_data/ 폴더에서 기존 데이터 폴백
        if (!csvData) {
            try {
                const resp = await fetch(`./stock_data/${ticker}.csv`);
                if (resp.ok) {
                    csvData = await resp.text();
                    const lines = csvData.trim().split('\n');
                    if (lines.length < 10) csvData = null;
                    else source = 'local';
                }
            } catch (e) { /* stock_data에도 없음 */ }
        }

        if (!csvData) {
            throw new Error('데이터를 불러올 수 없습니다. stock_data/ 폴더에 CSV 파일을 직접 넣어주세요.');
        }

        customTickerCSV = csvData;
        customTickerSymbol = ticker;

        // localStorage에 캐시 저장
        saveToCacheStorage(ticker, csvData);

        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',');
        const idxDate = headers.findIndex(h => h.includes('Date'));
        const firstDate = lines[1].split(',')[idxDate];
        const lastDate = lines[lines.length - 1].split(',')[idxDate];

        tickerDataRanges['__custom__'] = { minDate: firstDate, maxDate: lastDate };

        els.tickerDateInfo.textContent = `📅 데이터 기간: ${firstDate} ~ ${lastDate}`;
        els.startDate.value = firstDate;
        els.endDate.value = lastDate;

        // CSV 다운로드 버튼 표시 (Yahoo에서 가져온 경우에만)
        if (source === 'yahoo') {
            els.csvDownloadArea.classList.remove('hidden');
            els.downloadCsvBtn.onclick = () => downloadCSV(ticker, csvData);
        } else {
            els.csvDownloadArea.classList.add('hidden');
        }

        const sourceLabel = source === 'local' ? '기존 데이터' : source === 'cache' ? '캐시 데이터' : 'Yahoo Finance';
        els.tickerFetchStatus.textContent = `✅ ${ticker} 데이터 로드 완료! (${lines.length - 1}일치 · ${sourceLabel})`;
        els.tickerFetchStatus.className = 'ticker-fetch-status fetch-success';

    } catch (err) {
        els.tickerFetchStatus.textContent = `❌ ${err.message}`;
        els.tickerFetchStatus.className = 'ticker-fetch-status fetch-error';
        els.csvDownloadArea.classList.add('hidden');
        customTickerCSV = null;
        customTickerSymbol = '';
    } finally {
        els.fetchTickerBtn.disabled = false;
        els.fetchTickerBtn.textContent = '📥 데이터 불러오기';
    }
});

// CSV 다운로드 함수
function downloadCSV(ticker, csvData) {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// 엔터키로도 불러오기
els.customTickerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') els.fetchTickerBtn.click();
});

// Yahoo Finance API (CORS 프록시 경유)
async function fetchTickerFromYahoo(ticker) {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = 0;

    const yahooUrls = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTime}&period2=${endTime}&interval=1d&events=div%7Csplit`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTime}&period2=${endTime}&interval=1d&events=div%7Csplit`
    ];

    const corsProxies = [
        url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        url => `https://corsproxy.org/?${encodeURIComponent(url)}`,
    ];

    let data = null;

    // 직접 요청
    for (const yahooUrl of yahooUrls) {
        if (data) break;
        try {
            const resp = await fetch(yahooUrl);
            if (resp.ok) {
                const json = await resp.json();
                if (json?.chart?.result) { data = json; break; }
            }
        } catch (e) { /* CORS */ }
    }

    // CORS 프록시
    if (!data) {
        for (const makeProxy of corsProxies) {
            if (data) break;
            for (const yahooUrl of yahooUrls) {
                if (data) break;
                try {
                    const proxyUrl = makeProxy(yahooUrl);
                    const resp = await fetch(proxyUrl);
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json?.chart?.result) { data = json; break; }
                    }
                } catch (e) { /* proxy failed */ }
            }
        }
    }

    if (!data || !data.chart || !data.chart.result) {
        throw new Error('데이터를 불러올 수 없습니다. stock_data/ 폴더에 CSV 파일을 직접 넣어주세요.');
    }

    if (data.chart.error) {
        throw new Error(data.chart.error.description || '알 수 없는 오류');
    }

    return convertYahooToCSV(data.chart.result[0]);
}

function convertYahooToCSV(result) {
    const timestamps = result.timestamp;
    if (!timestamps || timestamps.length === 0) throw new Error('데이터가 비어있습니다.');

    const quotes = result.indicators.quote[0];
    const dividends = result.events?.dividends || {};
    const splits = result.events?.splits || {};

    const divByDate = {};
    for (const key of Object.keys(dividends)) {
        const d = dividends[key];
        divByDate[formatDateFromTimestamp(d.date)] = d.amount;
    }

    const splitByDate = {};
    for (const key of Object.keys(splits)) {
        const s = splits[key];
        splitByDate[formatDateFromTimestamp(s.date)] = s.numerator / s.denominator;
    }

    let csvLines = ['Date,Open,High,Low,Close,Adj Close,Volume,Dividends,Stock Splits'];
    for (let i = 0; i < timestamps.length; i++) {
        const dateStr = formatDateFromTimestamp(timestamps[i]);
        const close = quotes.close[i];
        if (close === null || close === undefined) continue;

        const open = quotes.open[i] || close;
        const high = quotes.high[i] || close;
        const low = quotes.low[i] || close;
        const volume = quotes.volume[i] || 0;
        const dividend = divByDate[dateStr] || 0;
        const split = splitByDate[dateStr] || 0;

        csvLines.push(`${dateStr},${open},${high},${low},${close},${close},${volume},${dividend},${split}`);
    }

    if (csvLines.length < 2) throw new Error('유효한 데이터가 없습니다.');
    return csvLines.join('\n');
}

function formatDateFromTimestamp(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// =============================================
// 2. 년도별 입금액 설정 모달
// =============================================

els.openYearlySettingBtn.addEventListener('click', () => {
    generateYearlyInputs();
    els.yearlyModal.classList.remove('hidden');
});

els.closeModalBtn.addEventListener('click', () => {
    els.yearlyModal.classList.add('hidden');
});

els.saveYearlyBtn.addEventListener('click', () => {
    saveYearlySettings();
    els.yearlyModal.classList.add('hidden');
});

els.yearlyModal.addEventListener('click', (e) => {
    if (e.target === els.yearlyModal) els.yearlyModal.classList.add('hidden');
});

function generateYearlyInputs() {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;
    els.yearlyInputs.innerHTML = '';

    for (let year = startYear; year <= endYear; year++) {
        const div = document.createElement('div');
        div.className = 'yearly-input-group';
        const savedAmount = yearlyDeposits[year] || defaultAmount;
        div.innerHTML = `
            <label>${year}년</label>
            <input type="number" id="yearly_${year}" value="${savedAmount}" min="0">
        `;
        els.yearlyInputs.appendChild(div);
    }
}

function saveYearlySettings() {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    yearlyDeposits = {};
    for (let year = startYear; year <= endYear; year++) {
        const input = document.getElementById(`yearly_${year}`);
        if (input) yearlyDeposits[year] = parseFloat(input.value) || 0;
    }
}

els.applyAutoIncreaseBtn.addEventListener('click', () => {
    const rate = parseFloat(els.autoIncreaseRate.value) / 100;
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    const baseAmount = parseFloat(els.regularDeposit.value) || 1000;

    let currentAmount = baseAmount;
    for (let year = startYear; year <= endYear; year++) {
        const input = document.getElementById(`yearly_${year}`);
        if (input) {
            input.value = Math.round(currentAmount);
            yearlyDeposits[year] = Math.round(currentAmount);
        }
        currentAmount *= (1 + rate);
    }
});

// =============================================
// 3. 시작 버튼 → 데이터 로드 → 시뮬레이션
// =============================================

els.startBtn.addEventListener('click', async () => {
    const ticker = els.tickerSelect.value;

    // 입력값 유효성 검증
    const startDateVal = els.startDate.value.trim();
    const endDateVal = els.endDate.value.trim();
    const initialDepositVal = els.initialDeposit.value.trim();
    const regularDepositVal = els.regularDeposit.value.trim();

    if (!startDateVal || !/^\d{4}-\d{2}-\d{2}$/.test(startDateVal)) {
        alert('시작일을 올바른 형식으로 입력해주세요. (예: 2010-01-01)');
        return;
    }
    if (!endDateVal || !/^\d{4}-\d{2}-\d{2}$/.test(endDateVal)) {
        alert('종료일을 올바른 형식으로 입력해주세요. (예: 2023-12-31)');
        return;
    }
    if (initialDepositVal === '' || isNaN(parseFloat(initialDepositVal)) || parseFloat(initialDepositVal) < 0) {
        alert('초기 거치금을 0 이상의 숫자로 입력해주세요.');
        return;
    }
    if (regularDepositVal === '' || isNaN(parseFloat(regularDepositVal)) || parseFloat(regularDepositVal) < 0) {
        alert('정기 입금액을 0 이상의 숫자로 입력해주세요.');
        return;
    }
    if (parseFloat(initialDepositVal) === 0 && parseFloat(regularDepositVal) === 0) {
        alert('초기 거치금과 정기 입금액이 모두 0이면 시뮬레이션할 수 없습니다.');
        return;
    }
    if (new Date(startDateVal) >= new Date(endDateVal)) {
        alert('시작일이 종료일보다 앞서야 합니다.');
        return;
    }

    els.startBtn.textContent = "데이터 불러오는 중...";
    els.startBtn.disabled = true;

    try {
        let csvText;
        if (ticker === '__custom__') {
            if (!customTickerCSV) {
                throw new Error("먼저 '📥 데이터 불러오기'로 데이터를 받아오세요.");
            }
            csvText = customTickerCSV;
        } else {
            // 기본 티커도 localStorage 캐시 우선 확인
            const cached = loadFromCacheStorage(ticker);
            if (cached && cached.trim().split('\n').length >= 10) {
                csvText = cached;
            } else {
                const response = await fetch(`./stock_data/${ticker}.csv`);
                if (!response.ok) throw new Error("CSV 파일을 찾을 수 없습니다.");
                csvText = await response.text();
            }
        }

        parseData(csvText);
        initSimulation();

    } catch (err) {
        alert("데이터 로드 실패: " + err.message);
        els.startBtn.textContent = "체험 시작하기";
        els.startBtn.disabled = false;
    }
});

// =============================================
// 4. CSV 파싱
// =============================================

function parseData(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');

    const idxDate = headers.findIndex(h => h.includes('Date'));
    // Adj Close 우선 사용 (분할/배당 조정 완료 가격), 없으면 Close 사용
    let idxClose = headers.findIndex(h => h.trim() === 'Adj Close');
    if (idxClose === -1) idxClose = headers.findIndex(h => h.trim() === 'Close');
    if (idxClose === -1) idxClose = headers.findIndex(h => h.includes('Close'));
    const idxDiv = headers.findIndex(h => h.includes('Dividends'));
    const idxSplit = headers.findIndex(h => h.includes('Stock Splits'));

    const startDate = new Date(els.startDate.value);
    const endDate = new Date(els.endDate.value);

    stockData = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length < 2) continue;
        const dateStr = row[idxDate];
        const dateObj = new Date(dateStr);

        if (dateObj >= startDate && dateObj <= endDate) {
            const close = parseFloat(row[idxClose]);
            if (isNaN(close) || close <= 0) continue; // 유효하지 않은 가격 행 건너뜀
            stockData.push({
                dateStr,
                dateObj,
                close,
                dividend: idxDiv > -1 ? (parseFloat(row[idxDiv]) || 0) : 0,
                split: idxSplit > -1 ? (parseFloat(row[idxSplit]) || 0) : 0
            });
        }
    }

    stockData.sort((a, b) => a.dateObj - b.dateObj);

    if (stockData.length === 0) {
        throw new Error("선택한 기간에 데이터가 없습니다.");
    }
}

// =============================================
// 5. 시뮬레이션 초기화 & 루프
// =============================================

function initSimulation() {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;

    if (Object.keys(yearlyDeposits).length === 0) {
        for (let year = startYear; year <= endYear; year++) {
            yearlyDeposits[year] = defaultAmount;
        }
    }

    portfolio.cash = parseFloat(els.initialDeposit.value) || 0;
    portfolio.shares = 0;
    portfolio.totalInvested = portfolio.cash;
    portfolio.totalDividends = 0;
    portfolio.currentDepositAmount = yearlyDeposits[startYear] || defaultAmount;
    portfolio.lastDepositMonth = -1;
    portfolio.lastDepositWeek = -1;
    currentIndex = 0;
    isPaused = false;
    speed = 50;

    els.logList.innerHTML = "";
    const selectedTicker = els.tickerSelect.value;
    if (selectedTicker === '__custom__') {
        els.displayTicker.textContent = customTickerSymbol || '??';
    } else {
        els.displayTicker.textContent = selectedTicker;
    }
    els.pauseBtn.textContent = "일시정지";
    els.pauseBtn.disabled = false;
    els.speedInput.value = speed;
    els.simDate.classList.remove('ended');

    initChart();

    els.setupScreen.classList.add('hidden');
    els.simScreen.classList.remove('hidden');

    buyStock(stockData[0].close, portfolio.cash, "💰 초기 거치금 투자");
    portfolio.cash = 0;

    const firstDay = stockData[0].dateObj;
    portfolio.lastDepositMonth = firstDay.getMonth();
    portfolio.lastDepositWeek = getWeekNumber(firstDay);
    currentIndex = 1;

    runLoop();
}

function runLoop() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        if (isPaused) return;
        if (currentIndex >= stockData.length - 1) {
            clearInterval(timer);
            if (currentIndex === stockData.length - 1) {
                processDay(stockData[currentIndex]);
            }
            addLog("🏁 시뮬레이션 종료", true);
            showEndState();
            return;
        }
        processDay(stockData[currentIndex]);
        currentIndex++;
    }, speed);
}

function showEndState() {
    isPaused = true;
    els.pauseBtn.textContent = "종료됨";
    els.pauseBtn.disabled = true;
    els.simDate.textContent = stockData[stockData.length - 1].dateStr + " 🏁";
    els.simDate.classList.add('ended');
}

// =============================================
// 6. 하루 처리 로직
// =============================================

function processDay(dayData) {
    const price = dayData.close;
    const currentYear = dayData.dateObj.getFullYear();

    // 역사적 사건
    if (historicalEvents[dayData.dateStr]) {
        addLog(historicalEvents[dayData.dateStr], true);
    }

    // 액면분할 (CSV 가격 데이터가 이미 분할 조정되어 있으므로 주식수는 변경하지 않음)
    if (dayData.split > 0 && dayData.split !== 1) {
        addLog(`✂️ 액면분할 ${dayData.split}:1 발생 (가격은 조정 완료)`);
    }

    // 배당금 (DRIP)
    if (dayData.dividend > 0) {
        const divTotal = portfolio.shares * dayData.dividend;
        if (divTotal > 0 && price > 0) {
            portfolio.totalDividends += divTotal;
            buyStock(price, divTotal, null);
            addLog(`💎 배당금 $${divTotal.toFixed(2)} 수령 → 재투자 (누적: $${Math.floor(portfolio.totalDividends).toLocaleString()})`);
        }
    }

    // 년도별 입금액
    if (yearlyDeposits[currentYear] !== undefined) {
        const newAmount = yearlyDeposits[currentYear];
        if (portfolio.currentDepositAmount !== newAmount) {
            const oldAmount = portfolio.currentDepositAmount;
            portfolio.currentDepositAmount = newAmount;
            if (oldAmount !== newAmount) {
                addLog(`📈 ${currentYear}년 입금액: $${newAmount.toLocaleString()}`);
            }
        }
    }

    // 정기 입금
    let shouldDeposit = false;
    const freq = els.frequency.value;
    if (freq === 'monthly') {
        const thisMonth = dayData.dateObj.getMonth();
        if (thisMonth !== portfolio.lastDepositMonth) {
            shouldDeposit = true;
            portfolio.lastDepositMonth = thisMonth;
        }
    } else if (freq === 'weekly') {
        const thisWeek = getWeekNumber(dayData.dateObj);
        if (thisWeek !== portfolio.lastDepositWeek) {
            shouldDeposit = true;
            portfolio.lastDepositWeek = thisWeek;
        }
    }

    if (shouldDeposit && portfolio.currentDepositAmount > 0) {
        portfolio.totalInvested += portfolio.currentDepositAmount;
        buyStock(price, portfolio.currentDepositAmount, "💵 정기 입금");
    }

    updateUI(dayData);
}

function processDayFast(dayData) {
    const price = dayData.close;
    const currentYear = dayData.dateObj.getFullYear();

    // 액면분할: CSV 가격 데이터가 이미 분할 조정되어 있으므로 주식수 변경 불필요

    if (dayData.dividend > 0) {
        const divTotal = portfolio.shares * dayData.dividend;
        if (divTotal > 0 && price > 0) {
            portfolio.totalDividends += divTotal;
            portfolio.shares += divTotal / price;
        }
    }

    if (yearlyDeposits[currentYear] !== undefined) {
        portfolio.currentDepositAmount = yearlyDeposits[currentYear];
    }

    let shouldDeposit = false;
    const freq = els.frequency.value;
    if (freq === 'monthly') {
        const thisMonth = dayData.dateObj.getMonth();
        if (thisMonth !== portfolio.lastDepositMonth) {
            shouldDeposit = true;
            portfolio.lastDepositMonth = thisMonth;
        }
    } else if (freq === 'weekly') {
        const thisWeek = getWeekNumber(dayData.dateObj);
        if (thisWeek !== portfolio.lastDepositWeek) {
            shouldDeposit = true;
            portfolio.lastDepositWeek = thisWeek;
        }
    }

    if (shouldDeposit && portfolio.currentDepositAmount > 0 && price > 0) {
        portfolio.totalInvested += portfolio.currentDepositAmount;
        portfolio.shares += portfolio.currentDepositAmount / price;
    }
}

function buyStock(price, amount, logMsg) {
    if (price <= 0) return;
    portfolio.shares += amount / price;
}

function updateUI(dayData) {
    const currentVal = portfolio.shares * dayData.close;
    const profit = currentVal - portfolio.totalInvested;
    const rate = portfolio.totalInvested > 0 ? (profit / portfolio.totalInvested * 100) : 0;

    els.simDate.textContent = dayData.dateStr;
    els.totalValue.textContent = `$${Math.floor(currentVal).toLocaleString()}`;
    els.totalInvested.textContent = `$${Math.floor(portfolio.totalInvested).toLocaleString()}`;
    els.totalShares.textContent = `${portfolio.shares.toFixed(2)}주`;

    els.returnRate.textContent = `${rate.toFixed(2)}%`;
    els.returnRate.className = `value ${rate >= 0 ? 'plus' : 'minus'}`;

    els.totalDividends.textContent = `$${Math.floor(portfolio.totalDividends).toLocaleString()}`;
    els.profitLoss.textContent = `${profit >= 0 ? '+' : ''}$${Math.floor(profit).toLocaleString()}`;
    els.profitLoss.className = `value sub-text ${profit >= 0 ? 'plus' : 'minus'}`;

    if (currentIndex % 5 === 0 || currentIndex === stockData.length - 1) {
        updateChart(dayData.dateStr, currentVal, portfolio.totalInvested);
    }
}

function addLog(msg, isEvent = false) {
    const li = document.createElement('li');
    if (isEvent) li.className = 'log-event';
    li.innerHTML = `<span style="color:#666">[${stockData[currentIndex].dateStr}]</span> ${msg}`;
    els.logList.prepend(li);
    if (els.logList.children.length > 50) {
        els.logList.lastElementChild.remove();
    }
}

// =============================================
// 7. 차트
// =============================================

function initChart() {
    const ctx = document.getElementById('assetChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '평가 금액',
                    data: [],
                    borderColor: '#2962ff',
                    backgroundColor: 'rgba(41, 98, 255, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: '투자 원금',
                    data: [],
                    borderColor: '#666',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: '#333' },
                    ticks: { color: '#888' }
                }
            },
            plugins: {
                legend: { labels: { color: '#ccc' } }
            }
        }
    });
}

function updateChart(label, value, invested) {
    chartInstance.data.labels.push(label);
    chartInstance.data.datasets[0].data.push(value);
    chartInstance.data.datasets[1].data.push(invested);
    chartInstance.update();
}

function rebuildChart() {
    initChart();

    const savedPortfolio = { ...portfolio };
    const savedIndex = currentIndex;

    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;
    const initialCash = parseFloat(els.initialDeposit.value) || 0;

    const firstDay = stockData[0].dateObj;
    let tempPortfolio = {
        shares: initialCash / stockData[0].close,
        totalInvested: initialCash,
        totalDividends: 0,
        currentDepositAmount: yearlyDeposits[startYear] || defaultAmount,
        lastDepositMonth: firstDay.getMonth(),
        lastDepositWeek: getWeekNumber(firstDay)
    };

    const step = 5;

    for (let i = 1; i < savedIndex; i++) {
        const dayData = stockData[i];
        const price = dayData.close;
        const currentYear = dayData.dateObj.getFullYear();

        // 액면분할: CSV 가격 데이터가 이미 분할 조정되어 있으므로 주식수 변경 불필요

        if (dayData.dividend > 0) {
            const divTotal = tempPortfolio.shares * dayData.dividend;
            if (divTotal > 0 && price > 0) {
                tempPortfolio.totalDividends += divTotal;
                tempPortfolio.shares += divTotal / price;
            }
        }

        if (yearlyDeposits[currentYear] !== undefined) {
            tempPortfolio.currentDepositAmount = yearlyDeposits[currentYear];
        }

        let shouldDeposit = false;
        const freq = els.frequency.value;
        if (freq === 'monthly') {
            const thisMonth = dayData.dateObj.getMonth();
            if (thisMonth !== tempPortfolio.lastDepositMonth) {
                shouldDeposit = true;
                tempPortfolio.lastDepositMonth = thisMonth;
            }
        } else if (freq === 'weekly') {
            const thisWeek = getWeekNumber(dayData.dateObj);
            if (thisWeek !== tempPortfolio.lastDepositWeek) {
                shouldDeposit = true;
                tempPortfolio.lastDepositWeek = thisWeek;
            }
        }

        if (shouldDeposit && tempPortfolio.currentDepositAmount > 0 && price > 0) {
            tempPortfolio.totalInvested += tempPortfolio.currentDepositAmount;
            tempPortfolio.shares += tempPortfolio.currentDepositAmount / price;
        }

        if (i % step === 0) {
            const val = tempPortfolio.shares * price;
            chartInstance.data.labels.push(dayData.dateStr);
            chartInstance.data.datasets[0].data.push(val);
            chartInstance.data.datasets[1].data.push(tempPortfolio.totalInvested);
        }
    }

    chartInstance.update();

    portfolio.shares = savedPortfolio.shares;
    portfolio.totalInvested = savedPortfolio.totalInvested;
    portfolio.totalDividends = savedPortfolio.totalDividends;
    portfolio.currentDepositAmount = savedPortfolio.currentDepositAmount;
    portfolio.lastDepositMonth = savedPortfolio.lastDepositMonth;
    portfolio.lastDepositWeek = savedPortfolio.lastDepositWeek;
    currentIndex = savedIndex;
}

// =============================================
// 8. 컨트롤 버튼
// =============================================

els.pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    els.pauseBtn.textContent = isPaused ? "재개" : "일시정지";
    if (!isPaused) runLoop();
});

els.applySpeedBtn.addEventListener('click', () => {
    speed = parseInt(els.speedInput.value) || 50;
    if (speed < 0) speed = 0;
    if (speed > 1000) speed = 1000;
    els.speedInput.value = speed;
    runLoop();
});

els.speedInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') els.applySpeedBtn.click();
});

els.jumpBtn.addEventListener('click', () => {
    const targetDate = els.jumpDate.value;
    if (!targetDate) { alert('이동할 날짜를 입력하세요 (YYYY-MM-DD)'); return; }

    const targetIdx = stockData.findIndex(d => d.dateStr >= targetDate);
    if (targetIdx === -1) { alert('해당 날짜를 찾을 수 없습니다.'); return; }

    if (timer) clearInterval(timer);
    els.pauseBtn.disabled = false;
    els.simDate.classList.remove('ended');

    resetPortfolioState(true, targetDate);
    currentIndex = 0;

    buyStock(stockData[0].close, portfolio.cash, null);
    portfolio.cash = 0;

    const firstDay = stockData[0].dateObj;
    portfolio.lastDepositMonth = firstDay.getMonth();
    portfolio.lastDepositWeek = getWeekNumber(firstDay);
    currentIndex = 1;

    while (currentIndex < targetIdx) {
        processDayFast(stockData[currentIndex]);
        currentIndex++;
    }

    rebuildChart();
    if (currentIndex < stockData.length) updateUI(stockData[currentIndex]);

    isPaused = true;
    els.pauseBtn.textContent = "재개";
});

els.jumpDate.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') els.jumpBtn.click();
});

function resetPortfolioState(keepLogs = false, targetDate = null) {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;

    portfolio.cash = parseFloat(els.initialDeposit.value) || 0;
    portfolio.shares = 0;
    portfolio.totalInvested = portfolio.cash;
    portfolio.totalDividends = 0;
    portfolio.currentDepositAmount = yearlyDeposits[startYear] || defaultAmount;
    portfolio.lastDepositMonth = -1;
    portfolio.lastDepositWeek = -1;

    initChart();

    if (keepLogs && targetDate) {
        const logs = els.logList.querySelectorAll('li');
        logs.forEach(log => {
            const dateMatch = log.textContent.match(/\[(\d{4}-\d{2}-\d{2})\]/);
            if (dateMatch && dateMatch[1] > targetDate) log.remove();
        });
    } else {
        els.logList.innerHTML = "";
    }
}

// 키보드 단축키
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (els.simScreen.classList.contains('hidden')) return;

    if (e.key === 'ArrowRight') {
        if (currentIndex < stockData.length - 1) {
            if (timer) clearInterval(timer);
            isPaused = true;
            els.pauseBtn.disabled = false;
            els.simDate.classList.remove('ended');
            els.pauseBtn.textContent = "재개";
            processDay(stockData[currentIndex]);
            currentIndex++;
        }
    } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 1) {
            if (timer) clearInterval(timer);
            isPaused = true;
            els.pauseBtn.disabled = false;
            els.simDate.classList.remove('ended');
            els.pauseBtn.textContent = "재개";

            const targetIdx = currentIndex - 1;
            const targetDate = stockData[targetIdx].dateStr;
            resetPortfolioState(true, targetDate);
            currentIndex = 0;
            buyStock(stockData[0].close, portfolio.cash, null);
            portfolio.cash = 0;

            const firstDay = stockData[0].dateObj;
            portfolio.lastDepositMonth = firstDay.getMonth();
            portfolio.lastDepositWeek = getWeekNumber(firstDay);
            currentIndex = 1;

            while (currentIndex < targetIdx) {
                processDayFast(stockData[currentIndex]);
                currentIndex++;
            }
            rebuildChart();
            updateUI(stockData[currentIndex]);
        }
    } else if (e.key === ' ') {
        e.preventDefault();
        els.pauseBtn.click();
    }
});

els.skipBtn.addEventListener('click', () => {
    const targetIdx = Math.min(currentIndex + 252, stockData.length - 1);

    while (currentIndex < targetIdx) {
        processDayFast(stockData[currentIndex]);
        currentIndex++;
    }

    rebuildChart();
    if (currentIndex < stockData.length) updateUI(stockData[currentIndex]);

    if (currentIndex >= stockData.length - 1) showEndState();
});

els.resetBtn.addEventListener('click', () => {
    location.reload();
});
